import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attemptPriorityBallot, buildBallotingPlan, main, runBallotingPlan, verifyBallotingRun } from './auto_ballot.js';
import { BookingSubmissionError } from './nac_booking_browser.js';
import { runBookingQueue, summarizeBookingRun } from './nac_booking_queue.js';

const entry = { label: 'lunch', date: '16/11/2026', time: '11:00-14:00', location_priority: ['AMK HUB', { location_name: 'PAYA LEBAR SQUARE' }] };

test('booking-compatible ranges expand into separate ordered hourly ballots', () => {
  const plan = buildBallotingPlan({ stop_on_failure: false, bookings: [entry] });
  assert.equal(plan.stopOnFailure, false);
  assert.deepEqual(plan.requests.map(({ date, from, to }) => ({ date, from, to })), [
    { date: '2026-11-16', from: '11:00', to: '12:00' },
    { date: '2026-11-16', from: '12:00', to: '13:00' },
    { date: '2026-11-16', from: '13:00', to: '14:00' },
  ]);
  assert.deepEqual(plan.requests[0].locationPriority.map((location) => location.locationName), ['AMK HUB', 'PAYA LEBAR SQUARE']);
});

test('ballots key and from/to input work; bad plans fail before browser startup', () => {
  assert.equal(buildBallotingPlan({ ballots: [{ ...entry, time: undefined, from: '19:00', to: '20:00' }] }).requests.length, 1);
  for (const config of [null, [], {}, { ballots: [] }, { ballots: [entry], bookings: [entry] },
    { ballots: [entry], stop_on_failure: 'false' },
    ...[{ date: '2026-02-30' }, { time: 'nonsense' }, { time: '11:00-14:00-extra' }, { time: '12:00-11:00' }, { time: '11:30-14:00' }, { location_priority: [] }]
      .map((change) => ({ ballots: [{ ...entry, ...change }] })),
    { ballots: [entry, { ...entry, time: '13:00-15:00' }] },
  ]) assert.throws(() => buildBallotingPlan(config));
});

test('actual booking config and new example can be previewed offline', async () => {
  const config = JSON.parse(await readFile(new URL('./auto_book.actual.json', import.meta.url)));
  assert.ok(buildBallotingPlan(config).requests.length >= config.bookings.length);
  const plan = await main(['--config=./scrape_nac_scripts/auto_ballot.example.json', '--dry-run']);
  assert.equal(plan.requests.length, 3);
  await assert.rejects(main(['--concurrency=2', '--dry-run']), /concurrency=1/);
});

const request = buildBallotingPlan({ ballots: [{ ...entry, time: '11:00-12:00' }] }).requests[0];
const resolve = async (entry) => ({ name: entry.locationName, location_id: entry.locationName });

test('preparation failure and definite rejection try the next priority; submission success ends the hour', async () => {
  for (const failure of ['preparation', 'rejection']) {
    const attempts = [];
    const result = await attemptPriorityBallot({}, request, { control: {}, resolve, ballot: async (_page, location) => {
      attempts.push(location.name);
      if (attempts.length === 1) {
        if (failure === 'preparation') throw new Error('Radio disabled.');
        return { outcome: 'rejected', success: false, textSnippet: 'Balloting not successful' };
      }
      return { success: true, outcome: 'confirmed' };
    } });
    assert.deepEqual(attempts, ['AMK HUB', 'PAYA LEBAR SQUARE']);
    assert.equal(result.pendingVerified, false);
    assert.equal(result.status, undefined);
    assert.equal(result.errors.length, 1);
  }
});

test('uncertainty stops fallbacks and later hours even with stop_on_failure false', async () => {
  const control = {};
  let attempts = 0;
  const requests = buildBallotingPlan({ ballots: [entry] }).requests;
  const results = await runBookingQueue({ requests, pages: [{}], control, stopOnFailure: false,
    attempt: (page, request) => attemptPriorityBallot(page, request, { control, resolve, ballot: async () => {
      attempts += 1;
      throw new BookingSubmissionError('No explicit submission feedback.');
    } }),
  });
  assert.equal(attempts, 1);
  assert.deepEqual(results.map((result) => result.outcome), ['unknown', 'not-started', 'not-started']);
  assert.match(control.stopReason.error, /feedback/);
});

test('missing submission confirmation stops even when a caller reports success', async () => {
  const control = {};
  const result = await attemptPriorityBallot({}, request, { control, resolve, ballot: async () => ({ success: true }) });
  assert.equal(result.outcome, 'unknown');
  assert.equal(control.stopped, true);
});

test('all submissions finish before the single final verification', async () => {
  const plan = buildBallotingPlan({ ballots: [entry] });
  const order = [];
  const { results, verification } = await runBallotingPlan({}, plan, {
    resolve,
    ballot: async (_page, _location, request) => {
      order.push(request.from);
      return { success: true, outcome: 'confirmed' };
    },
    verify: async (_page, results) => {
      order.push('verify');
      assert.equal(results.length, 3);
      assert.ok(results.every((result) => result.success && !result.pendingVerified));
      return { success: true };
    },
  });
  assert.deepEqual(order, ['11:00', '12:00', '13:00', 'verify']);
  assert.equal(results.length, 3);
  assert.equal(verification.success, true);
});

test('history is refreshed and fully expanded before the single read', async () => {
  const order = [];
  const results = [{ request, location: { name: 'AMK HUB' }, success: true, outcome: 'confirmed', pendingVerified: false }];
  const result = await verifyBallotingRun({}, results, {
    refresh: async () => { order.push('refresh'); },
    loadAll: async () => { order.push('load-all'); return { complete: true, pagesLoaded: 4 }; },
    read: async (_page, expected) => { order.push('read'); return expected.map((entry) => ({ ...entry, status: 'PENDING', pendingVerified: true })); },
  });
  assert.deepEqual(order, ['refresh', 'load-all', 'read']);
  assert.equal(result.pending, 1);
  assert.equal(results[0].status, 'PENDING');
});

test('incomplete or stalled history never triggers a read or resubmission', async () => {
  const results = [{ request, location: { name: 'AMK HUB' }, success: true, outcome: 'confirmed', pendingVerified: false }];
  let reads = 0;
  const verification = await verifyBallotingRun({}, results, {
    refresh: async () => {}, loadAll: async () => ({ complete: false }),
    read: async () => { reads++; },
  });
  assert.equal(verification.success, false);
  assert.equal(reads, 0);
  assert.equal(results[0].success, true);
  assert.equal(results[0].pendingVerified, false);
});

test('missing final PENDING tiles are reported while retaining successful submission outcomes', async () => {
  const results = [{ request, location: { name: 'AMK HUB' }, success: true, outcome: 'confirmed' }];
  const verification = await verifyBallotingRun({}, results, {
    refresh: async () => {}, loadAll: async () => ({ complete: true, pagesLoaded: 1 }),
    read: async (_page, expected) => expected.map((entry) => ({ ...entry, status: null, pendingVerified: false })),
  });
  assert.equal(verification.success, false);
  assert.equal(verification.missing.length, 1);
  assert.equal(results[0].outcome, 'confirmed');
});

test('summary retains PENDING as the application status', () => {
  const result = { request, success: true, outcome: 'confirmed', status: 'PENDING', pendingVerified: true };
  const summary = summarizeBookingRun([result], { durationMs: 1, workerErrors: [] });
  assert.equal(summary.results[0].status, 'PENDING');
  assert.equal(summary.results[0].pendingVerified, true);
});
