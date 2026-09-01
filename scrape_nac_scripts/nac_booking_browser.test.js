import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSlotsForSelectedDate } from './nac_booking_browser.js';

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
