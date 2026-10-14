import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, runBookingQueue, stopBookingQueue, summarizeBookingRun, validateBookingPlan } from './nac_booking_queue.js';
import { attemptPriorityBooking } from './auto_book.js';
import { BookingSubmissionError } from './nac_booking_browser.js';

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const request = (day = 1, extra = {}) => ({
  label: `booking-${day}`, date: `2026-11-${String(day).padStart(2, '0')}`, from: '10:00', to: '12:00',
  locationPriority: [{ name: 'first' }, { name: 'second' }], ...extra,
});

test('duplicates and overlaps are rejected across different date formats and locations', () => {
  assert.throws(() => validateBookingPlan([request(), request(2, { date: '01/11/2026', from: '11:00', to: '13:00' })]), /Overlapping/);
  assert.throws(() => validateBookingPlan([request(), request()]), /Overlapping/);
  assert.doesNotThrow(() => validateBookingPlan([request(), request(1, { from: '12:00', to: '14:00' })]));
  assert.throws(() => validateBookingPlan([request(1, { from: '10:30' })]), /whole-hour/);
});

test('two workers overlap, use distinct pages, and preserve result order', async () => {
  const started = deferred();
  const release = deferred();
  const calls = [];
  const run = runBookingQueue({
    requests: [request(1), request(2), request(3)], pages: ['page-a', 'page-b'], control: {}, stopOnFailure: false,
    attempt: async (page, req) => {
      calls.push([page, req.label]);
      if (calls.length === 2) started.resolve();
      await release.promise;
      return { success: true, request: req };
    },
  });
  await started.promise;
  assert.deepEqual(calls, [['page-a', 'booking-1'], ['page-b', 'booking-2']]);
  release.resolve();
  assert.deepEqual((await run).map((result) => result.request.label), ['booking-1', 'booking-2', 'booking-3']);
});

test('ready tab starts booking while another loads, which joins only when ready', { timeout: 1_000 }, async () => {
  const secondReady = deferred();
  const firstBookingStarted = deferred();
  const secondBookingStarted = deferred();
  const finishBookings = deferred();
  const calls = [];
  const run = runBookingQueue({
    requests: [request(1), request(2), request(3)], pages: ['ready-tab', null], control: {},
    preparePage: async (page) => page ?? secondReady.promise,
    attempt: async (page, req) => {
      calls.push([page, req.label]);
      if (calls.length === 1) firstBookingStarted.resolve();
      if (calls.length === 2) secondBookingStarted.resolve();
      await finishBookings.promise;
      return { success: true, request: req };
    },
  });
  await firstBookingStarted.promise;
  assert.deepEqual(calls, [['ready-tab', 'booking-1']]);
  secondReady.resolve('later-tab');
  await secondBookingStarted.promise;
  assert.deepEqual(calls, [['ready-tab', 'booking-1'], ['later-tab', 'booking-2']]);
  finishBookings.resolve();
  assert.equal((await run).filter((result) => result.success).length, 3);
});

test('a ready worker can drain the queue without waiting for a loading tab', { timeout: 1_000 }, async () => {
  const secondReady = deferred();
  const allAttempted = deferred();
  const calls = [];
  const run = runBookingQueue({
    requests: [request(1), request(2)], pages: ['ready-tab', null], control: {},
    preparePage: async (page) => page ?? secondReady.promise,
    attempt: async (page, req) => {
      calls.push([page, req.label]);
      if (calls.length === 2) allAttempted.resolve();
      return { success: true, request: req };
    },
  });
  await allAttempted.promise;
  assert.deepEqual(calls, [['ready-tab', 'booking-1'], ['ready-tab', 'booking-2']]);
  secondReady.resolve('late-tab');
  assert.equal((await run).every((result) => result.success), true);
  assert.equal(calls.length, 2);
});

test('tab startup failure preserves in-flight work and lets the ready tab finish', { timeout: 1_000 }, async () => {
  const bookingStarted = deferred();
  const startupFailed = deferred();
  const finishBooking = deferred();
  const workerErrors = [];
  let finished = false;
  const run = runBookingQueue({
    requests: [request(1), request(2)], pages: ['ready-tab', null], control: {}, workerErrors,
    preparePage: async (page) => {
      if (page) return page;
      await bookingStarted.promise;
      startupFailed.resolve();
      throw new Error('navigation timeout');
    },
    attempt: async (_page, req) => {
      bookingStarted.resolve();
      await finishBooking.promise;
      return { success: true, request: req };
    },
  }).then((results) => { finished = true; return results; });
  await startupFailed.promise;
  assert.equal(finished, false);
  finishBooking.resolve();
  assert.equal((await run).every((result) => result.success), true);
  assert.deepEqual(workerErrors, [{ worker: 2, stage: 'tab-startup', error: 'navigation timeout' }]);
});

test('a tab becoming ready after an uncertain submission cannot claim work', { timeout: 1_000 }, async () => {
  const secondReady = deferred();
  const control = {};
  const calls = [];
  const run = runBookingQueue({
    requests: [request(1), request(2)], pages: ['ready-tab', null], control, stopOnFailure: false,
    preparePage: async (page) => page ?? secondReady.promise,
    attempt: async (page, req) => {
      calls.push(page);
      setImmediate(() => secondReady.resolve('late-tab'));
      return { success: false, stopQueue: true, outcome: 'unknown', request: req };
    },
  });
  const results = await run;
  assert.equal(control.stopped, true);
  assert.deepEqual(calls, ['ready-tab']);
  assert.equal(results[1].outcome, 'not-started');
});

test('uncertain submission halts both workers even with stop_on_failure false', async () => {
  const failure = deferred();
  const otherPreparing = deferred();
  const control = { stopped: false };
  const submitted = [];
  const results = await runBookingQueue({
    requests: [request(1), request(2), request(3)], pages: ['a', 'b'], control, stopOnFailure: false,
    attempt: (page, req) => attemptPriorityBooking(page, req, {
      control, limit: createLimiter(4), resolve: async (entry) => entry, precheck: async () => {},
      book: async (_page, _location, req, guard) => {
        if (req.label === 'booking-1') {
          await otherPreparing.promise;
          submitted.push(req.label);
          // Release the other worker only after the halt has propagated.
          setImmediate(() => failure.resolve());
          throw new BookingSubmissionError('lost response');
        }
        otherPreparing.resolve();
        await failure.promise;
        assert.equal(guard.stopped, true);
        throw new BookingSubmissionError('stopped', 'not-submitted');
      },
    }),
  });
  assert.deepEqual(submitted, ['booking-1']);
  assert.deepEqual(results.map((result) => result.outcome), ['unknown', 'not-submitted', 'not-started']);
});

test('availability checks overlap but a faster lower priority cannot win', async () => {
  const releaseFirst = deferred();
  const secondChecked = deferred();
  const booked = [];
  const work = attemptPriorityBooking({}, request(), {
    control: {}, limit: createLimiter(4), resolve: async (entry) => entry,
    precheck: async (location) => {
      if (location.name === 'first') await releaseFirst.promise;
      else secondChecked.resolve();
    },
    book: async (_page, location) => booked.push(location.name),
  });
  await secondChecked.promise;
  assert.deepEqual(booked, []);
  releaseFirst.resolve();
  assert.equal((await work).location.name, 'first');
});

test('unavailable first priority falls back; submission uncertainty never does', async () => {
  const dependencies = { control: {}, limit: createLimiter(2), resolve: async (entry) => entry };
  const fallback = await attemptPriorityBooking({}, request(), {
    ...dependencies,
    precheck: async (location) => { if (location.name === 'first') throw new Error('unavailable'); },
    book: async () => {},
  });
  assert.equal(fallback.location.name, 'second');
  const attempts = [];
  const unknown = await attemptPriorityBooking({}, request(), {
    ...dependencies, precheck: async () => {},
    book: async (_page, location) => { attempts.push(location.name); throw new BookingSubmissionError('unknown'); },
  });
  assert.deepEqual(attempts, ['first']);
  assert.equal(unknown.outcome, 'unknown');
});

test('availability limiter bounds concurrency across workers', async () => {
  const limit = createLimiter(4);
  let active = 0;
  let maximum = 0;
  await Promise.all(Array.from({ length: 12 }, () => limit(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
  })));
  assert.equal(maximum, 4);
});

test('definite rejection advances to the next location in priority order', async () => {
  const control = {};
  const attempts = [];
  const result = await attemptPriorityBooking({}, request(), {
    control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
    book: async (_page, location) => {
      attempts.push(location.name);
      if (location.name === 'first') return { success: false, outcome: 'rejected', textSnippet: 'Event creation not successful' };
    },
  });
  assert.equal(result.success, true);
  assert.deepEqual(attempts, ['first', 'second']);
  assert.equal(Boolean(control.stopped), false);
});

test('exhausted rejected locations advance to the next requested timeslot with stop_on_failure false', async () => {
  const control = {};
  const attempts = [];
  const results = await runBookingQueue({
    requests: [request(1), request(2)], pages: ['a'], control, stopOnFailure: false,
    attempt: (page, req) => attemptPriorityBooking(page, req, {
      control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
      book: async (_page, location, req) => {
        attempts.push([req.label, location.name]);
        if (req.label === 'booking-1') return { success: false, outcome: 'rejected', textSnippet: 'Event creation not successful' };
      },
    }),
  });
  assert.deepEqual(attempts, [['booking-1', 'first'], ['booking-1', 'second'], ['booking-2', 'first']]);
  assert.deepEqual(results.map((result) => result.success), [false, true]);
  assert.equal(Boolean(control.stopped), false);
});

test('failed cleanup after a rejection never advances to another location', async () => {
  const control = {};
  const attempts = [];
  const result = await attemptPriorityBooking({}, request(), {
    control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
    book: async (_page, location) => {
      attempts.push(location.name);
      throw new BookingSubmissionError('Rejection popup could not be cleared', 'rejected');
    },
  });
  assert.deepEqual(attempts, ['first']);
  assert.equal(result.stopQueue, true);
  assert.equal(control.stopped, true);
});

test('confirmed booking with cleanup failure is recorded as successful and stops new work', async () => {
  const control = {};
  const results = await runBookingQueue({
    requests: [request(1), request(2)], pages: ['a'], control, stopOnFailure: false,
    attempt: (page, req) => attemptPriorityBooking(page, req, {
      control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
      book: async () => { throw new BookingSubmissionError('popup stuck', 'confirmed'); },
    }),
  });
  assert.equal(results[0].success, true);
  assert.equal(results[0].outcome, 'confirmed');
  assert.equal(results[0].stopQueue, true);
  assert.equal(results[1].outcome, 'not-started');
});

test('stop_on_failure stops assignment while an already submitted worker finishes', async () => {
  const started = deferred();
  const failed = deferred();
  const results = await runBookingQueue({
    requests: [request(1), request(2), request(3)], pages: ['a', 'b'], control: {}, stopOnFailure: true,
    attempt: async (_page, req) => {
      if (req.label === 'booking-1') {
        await started.promise;
        setImmediate(() => failed.resolve());
        return { request: req, success: false };
      }
      started.resolve();
      await failed.promise;
      return { request: req, success: true };
    },
  });
  assert.deepEqual(results.map((result) => result.success), [false, true, false]);
  assert.equal(results[2].outcome, 'not-started');
});

test('one submission failure is reported as one failure and the remaining requests as skipped', async () => {
  const notifications = [];
  const control = { onStop: (reason) => notifications.push(reason) };
  const results = await runBookingQueue({
    requests: [request(1), request(2), request(3)], pages: ['a'], control, stopOnFailure: false,
    attempt: async (_page, req) => ({
      request: req, success: false, outcome: 'unknown', stopQueue: true,
      errors: [{ error: 'Booking confirmation timed out.' }],
    }),
  });
  const summary = summarizeBookingRun(results, { durationMs: 100, workerErrors: [], stopReason: control.stopReason });
  assert.deepEqual(summary.counts, { confirmed: 0, failed: 1, skipped: 2 });
  assert.equal(summary.stopReason.label, 'booking-1');
  assert.equal(summary.stopReason.error, 'Booking confirmation timed out.');
  assert.equal(summary.results.length, 1);
  assert.deepEqual(summary.skipped.map((result) => result.label), ['booking-2', 'booking-3']);
  assert.equal(summary.skipped.some((result) => result.errors), false);
  assert.equal(results[1].errors, undefined);
  assert.equal(notifications.length, 1);
});

test('another worker cancellation cannot overwrite the original queue stop cause', () => {
  const notifications = [];
  const control = { onStop: (reason) => notifications.push(reason) };
  stopBookingQueue(control, {
    request: request(1), outcome: 'unknown', errors: [{ error: 'Original submission timeout' }],
  }, 1);
  stopBookingQueue(control, {
    request: request(2), outcome: 'not-submitted', errors: [{ error: 'Queue stopped before submission' }],
  }, 2);
  assert.equal(control.stopReason.label, 'booking-1');
  assert.equal(control.stopReason.error, 'Original submission timeout');
  assert.equal(notifications.length, 1);
});

test('stop_on_failure retains the original preparation error as the stop cause', async () => {
  const control = {};
  const results = await runBookingQueue({
    requests: [request(1), request(2)], pages: ['a'], control, stopOnFailure: true,
    attempt: async (_page, req) => ({
      request: req, success: false, outcome: 'failed', errors: [{ error: 'No selectable slots' }],
    }),
  });
  assert.equal(control.stopReason.error, 'No selectable slots');
  assert.equal(results[1].outcome, 'not-started');
  assert.equal(results[1].errors, undefined);
});
