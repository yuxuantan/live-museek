import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSlotsForSelectedDate, selectBookingDate } from './nac_booking_browser.js';
import { parseCliArgs } from './auto_book.js';

test('submission waits default to unbounded and accept separate finite limits', () => {
  const defaults = parseCliArgs([]);
  assert.equal(defaults.confirmationTimeoutMs, 0);
  assert.equal(defaults.submissionTimeoutMs, 0);
  const custom = parseCliArgs(['--confirmation-timeout-ms=30000', '--submission-timeout-ms=120000']);
  assert.equal(custom.confirmationTimeoutMs, 30_000);
  assert.equal(custom.submissionTimeoutMs, 120_000);
  for (const flag of ['--confirmation-timeout-ms', '--submission-timeout-ms']) {
    for (const value of ['', '-1', '1.5', '12ms', '1=2', 'Infinity', '9007199254740992']) {
      assert.throws(() => parseCliArgs([`${flag}=${value}`]), /non-negative integer/);
    }
  }
});

function createResponse({ ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    url: () => 'https://eservices.nac.gov.sg/Busking/bookings/locations/location-id/availablities?date=16%2F09%2F2026',
    request: () => ({ method: () => 'GET' }),
    ok: () => ok,
    status: () => status,
    statusText: () => statusText,
  };
}

function createPage({ renderFailures = 0, responses = [] } = {}) {
  const calls = {
    loadClicks: 0,
    requestedSlotKeys: [],
    responseTimeouts: [],
    renderTimeouts: [],
  };
  let remainingRenderFailures = renderFailures;
  let responseIndex = 0;

  return {
    calls,
    async evaluate(_callback, label) {
      assert.equal(label, 'Load');
      calls.loadClicks += 1;
      return true;
    },
    async waitForResponse(predicate, options) {
      const response = responses[responseIndex] ?? createResponse();
      responseIndex += 1;
      assert.equal(predicate(response), true);
      calls.responseTimeouts.push(options.timeout);
      return response;
    },
    async waitForFunction(_callback, options, requestedSlotKeys) {
      calls.renderTimeouts.push(options.timeout);
      calls.requestedSlotKeys.push(requestedSlotKeys);
      if (remainingRenderFailures > 0) {
        remainingRenderFailures -= 1;
        throw new Error('render timed out');
      }
    },
  };
}

test('waits for the NAC response and every requested hourly slot', async () => {
  const page = createPage();

  await loadSlotsForSelectedDate(page, '10:00', '14:00', {
    timeoutMs: 321,
    maxAttempts: 1,
  });

  assert.equal(page.calls.loadClicks, 1);
  assert.deepEqual(page.calls.responseTimeouts, [321]);
  assert.deepEqual(page.calls.renderTimeouts, [321]);
  assert.deepEqual(page.calls.requestedSlotKeys, [[
    '10:00-11:00',
    '11:00-12:00',
    '12:00-13:00',
    '13:00-14:00',
  ]]);
});

test('retries Load once when the requested rows do not render in time', async () => {
  const page = createPage({ renderFailures: 1 });

  await loadSlotsForSelectedDate(page, '16:00', '20:00', {
    timeoutMs: 321,
    maxAttempts: 2,
  });

  assert.equal(page.calls.loadClicks, 2);
  assert.equal(page.calls.requestedSlotKeys.length, 2);
});

test('fails closed when the NAC availability response is unsuccessful', async () => {
  const page = createPage({
    responses: [createResponse({ ok: false, status: 503, statusText: 'Service Unavailable' })],
  });

  await assert.rejects(
    loadSlotsForSelectedDate(page, '10:00', '14:00', {
      timeoutMs: 321,
      maxAttempts: 1,
    }),
    /503 Service Unavailable/
  );
});

test('date picker timeout identifies the date and failed opening step', async () => {
  let evaluations = 0;
  const page = {
    evaluate: async () => ++evaluations === 1 ? { dateKey: '2026-10-01' } : true,
    waitForFunction: async () => { throw new Error('Waiting failed: 5000ms exceeded'); },
  };
  await assert.rejects(selectBookingDate(page, '2026-10-04'), /date picker did not open for 2026-10-04: Waiting failed/);
});

test('selected date timeout identifies the date-field update step', async () => {
  const responses = [
    { dateKey: '2026-10-01' }, true, { dateKey: '2026-10-01' },
    { year: 2026, monthIndex: 9 }, [{ index: 0, dateKey: '2026-10-04' }],
    { exists: true }, { exists: true, clicked: true },
  ];
  let waits = 0;
  const page = {
    evaluate: async () => responses.shift(),
    waitForFunction: async (_callback, options) => {
      assert.equal(options.polling, 100);
      if (++waits === 2) throw new Error('Waiting failed: 5000ms exceeded');
    },
  };
  await assert.rejects(selectBookingDate(page, '2026-10-04'), /date field did not change to 2026-10-04 after selection: Waiting failed/);
});
