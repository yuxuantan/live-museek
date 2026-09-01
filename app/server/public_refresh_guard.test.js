import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublicRefreshGuard,
  getRefreshClientIdentifier,
  PublicRefreshGuardError,
} from './public_refresh_guard.js';

function requestFor(ip, headerName = 'x-vercel-forwarded-for') {
  return new Request('https://livemuseek.com/api/refresh', {
    headers: { [headerName]: ip },
  });
}

test('uses the platform client address before forwarded fallbacks', () => {
  const request = new Request('https://livemuseek.com/api/refresh', {
    headers: {
      'x-vercel-forwarded-for': '203.0.113.8',
      'x-forwarded-for': '198.51.100.9, 192.0.2.4',
    },
  });

  assert.equal(getRefreshClientIdentifier(request), '203.0.113.8');
  assert.equal(
    getRefreshClientIdentifier(requestFor('198.51.100.9, 192.0.2.4', 'x-forwarded-for')),
    '198.51.100.9'
  );
});

test('limits accepted refreshes per visitor within the rolling window', async () => {
  let currentTime = 1_000;
  const guard = createPublicRefreshGuard({
    now: () => currentTime,
    windowMs: 60_000,
    maxRequestsPerWindow: 2,
    minimumStartIntervalMs: 0,
  });
  const request = requestFor('203.0.113.8');

  await guard.run(request, async () => 'first');
  currentTime += 1;
  await guard.run(request, async () => 'second');

  await assert.rejects(
    guard.run(request, async () => 'third'),
    (error) => {
      assert.ok(error instanceof PublicRefreshGuardError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterSeconds, 60);
      return true;
    }
  );

  currentTime += 60_000;
  await assert.doesNotReject(guard.run(request, async () => 'after-window'));
});

test('rejects overlapping refresh work and releases capacity afterward', async () => {
  const guard = createPublicRefreshGuard({
    now: () => 1_000,
    maxConcurrentRefreshes: 1,
    minimumStartIntervalMs: 0,
  });
  let finishFirstRefresh;
  const firstRefresh = guard.run(
    requestFor('203.0.113.8'),
    () => new Promise((resolve) => {
      finishFirstRefresh = resolve;
    })
  );

  await assert.rejects(
    guard.run(requestFor('198.51.100.9'), async () => 'overlap'),
    (error) => {
      assert.ok(error instanceof PublicRefreshGuardError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterSeconds, 15);
      return true;
    }
  );

  finishFirstRefresh('done');
  assert.equal(await firstRefresh, 'done');
  await assert.doesNotReject(
    guard.run(requestFor('198.51.100.9'), async () => 'next')
  );
});

test('spaces out refresh starts across different visitors', async () => {
  let currentTime = 10_000;
  const guard = createPublicRefreshGuard({
    now: () => currentTime,
    minimumStartIntervalMs: 2_000,
  });

  await guard.run(requestFor('203.0.113.8'), async () => 'first');
  currentTime += 500;

  await assert.rejects(
    guard.run(requestFor('198.51.100.9'), async () => 'too-soon'),
    (error) => {
      assert.ok(error instanceof PublicRefreshGuardError);
      assert.equal(error.retryAfterSeconds, 2);
      return true;
    }
  );

  currentTime += 1_500;
  await assert.doesNotReject(
    guard.run(requestFor('198.51.100.9'), async () => 'spaced')
  );
});

test('releases refresh capacity when the refresh action fails', async () => {
  const guard = createPublicRefreshGuard({
    now: () => 1_000,
    maxConcurrentRefreshes: 1,
    minimumStartIntervalMs: 0,
  });

  await assert.rejects(
    guard.run(requestFor('203.0.113.8'), async () => {
      throw new Error('scrape failed');
    }),
    /scrape failed/
  );

  await assert.doesNotReject(
    guard.run(requestFor('198.51.100.9'), async () => 'recovered')
  );
});
