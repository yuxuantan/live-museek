import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLocationAvailability } from './nac_availability_client.js';

test('availability timeout remains active while reading a stalled response body', async (t) => {
  // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
  const keepAlive = setTimeout(() => {}, 1_000);
  t.after(() => clearTimeout(keepAlive));
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => ({
    ok: true,
    json: () => new Promise((_resolve, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }));
  await assert.rejects(fetchLocationAvailability('location', '2026-11-01', { timeoutMs: 25 }),
    (error) => error.name === 'TimeoutError');
});
