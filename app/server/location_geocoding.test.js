import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocationGeocoder } from './location_geocoding.js';
import { hasCoordinates, directionsUrl } from '../locationCoordinates.js';

const env = { GOOGLE_MAPS_API_KEY: 'server-test-key', NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'browser-test-key' };
const address = '1 Example Road Singapore 123456';
const existing = { address, lat: 1.3, lng: 103.8 };
const success = { data: { status: 'OK', results: [{ geometry: { location: { lat: 1.31, lng: 103.81 } } }] } };

test('unchanged stored coordinates make zero requests across fresh resolver instances', async () => {
  for (let i = 0; i < 2; i++) {
    const resolve = createLocationGeocoder({ env: {}, client: { geocode: () => assert.fail('unexpected request') } });
    assert.deepEqual(await resolve(`  ${address.toUpperCase()}  `, existing), { lat: 1.3, lng: 103.8 });
  }
});

for (const [label, previous, input] of [
  ['new location', undefined, address],
  ['changed address', existing, '2 Example Road'],
  ['missing latitude', { ...existing, lat: null }, address],
  ['invalid coordinates', { ...existing, lng: NaN }, address],
]) {
  test(`${label} makes one Google lookup and uses the server key`, async () => {
    const calls = [];
    const resolve = createLocationGeocoder({ env, client: { geocode: async (args) => { calls.push(args); return success; } } });
    assert.deepEqual(await resolve(input, previous), { lat: 1.31, lng: 103.81 });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { params: { address: input, region: 'sg', key: 'server-test-key' }, timeout: 10000 });
  });
}

test('identical simultaneous lookups share one request', async () => {
  let calls = 0;
  const resolve = createLocationGeocoder({ env, client: { geocode: async () => { calls++; return success; } } });
  await Promise.all([resolve(address), resolve(address.toUpperCase())]);
  assert.equal(calls, 1);
});

test('blank addresses and missing credentials never make a Google request', async () => {
  const resolve = createLocationGeocoder({ env: {}, client: { geocode: () => assert.fail('unexpected request') } });
  assert.deepEqual(await resolve(' '), { lat: null, lng: null });
  await assert.rejects(resolve(address), /not configured/);
});

test('existing local browser key remains a compatible fallback', async () => {
  const resolve = createLocationGeocoder({ env: { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'local-key' }, client: {
    geocode: async ({ params }) => { assert.equal(params.key, 'local-key'); return success; },
  } });
  assert.ok(hasCoordinates(await resolve(address)));
});

test('no match leaves coordinates missing; API errors and invalid results do not become pins', async () => {
  const resolve = createLocationGeocoder({ env, client: { geocode: async () => ({ data: { status: 'ZERO_RESULTS' } }) } });
  assert.deepEqual(await resolve(address), { lat: null, lng: null });
  for (const data of [ { status: 'REQUEST_DENIED' }, { status: 'OVER_QUERY_LIMIT' }, { status: 'OK', results: [] },
    { status: 'OK', results: [{ geometry: { location: { lat: null, lng: 103.8 } } }] } ]) {
    const failing = createLocationGeocoder({ env, client: { geocode: async () => ({ data }) } });
    await assert.rejects(failing(address));
  }
});

test('a failed request does not prevent a later retry', async () => {
  let calls = 0;
  const resolve = createLocationGeocoder({ env, client: { geocode: async () => {
    if (++calls === 1) throw new Error('timeout');
    return success;
  } } });
  await assert.rejects(resolve(address), /timeout/);
  assert.ok(hasCoordinates(await resolve(address)));
  assert.equal(calls, 2);
});

test('map accepts existing coordinates without provider metadata and excludes missing coordinates', () => {
  assert.equal(hasCoordinates(existing), true);
  assert.equal(hasCoordinates({ ...existing, lat: null }), false);
  assert.equal(hasCoordinates({ ...existing, lng: '' }), false);
});

test('directions use an encoded URL without an API key', () => {
  const url = new URL(directionsUrl({ name: 'A & B', address: 'Road #1' }));
  assert.equal(url.searchParams.get('destination'), 'A & B, Road #1, Singapore');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.has('key'), false);
});
