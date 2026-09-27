import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { Client } from '@googlemaps/google-maps-services-js';
import { scrapeLocations } from './scrape_locations.js';

function setKey(t) {
  const old = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  t.after(() => { if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = old; });
}
const imageResponse = { ok: () => true, headers: () => ({ 'content-type': 'image/jpeg' }), buffer: async () => Buffer.alloc(0) };

for (const newLocation of [false, true]) {
  test(`directory scraper only geocodes new locations (${newLocation ? 'one new location' : 'no new locations'})`, async (t) => {
    setKey(t);
    const visited = [];
    const writes = [];
    let geocodes = 0;
    let closed = false;
    t.mock.method(Client.prototype, 'geocode', async () => { geocodes++; return { data: { status: 'OK', results: [{ geometry: { location: { lat: 1.3, lng: 103.8 } } }] } }; });
    t.mock.method(axios, 'get', async () => ({ data: `<select id="Location"><option value="existing">Existing</option>${newLocation ? '<option value="new">New</option><option value="new">New</option>' : ''}</select>` }));
    t.mock.method(puppeteer, 'launch', async () => {
      assert.equal(newLocation, true, 'no browser needed when nothing changed');
      return { newPage: async () => ({
        goto: async (url) => { visited.push(url); return imageResponse; },
        content: async () => '<div id="div-header"><ul><li class="dash-bx-times">New address</li></ul><p>Description</p><span>Central</span></div>',
      }), close: async () => { closed = true; } };
    });
    t.mock.method(globalThis, 'fetch', async (input, options) => {
      const url = new URL(input);
      assert.equal(url.pathname, '/rest/v1/locations');
      if (options.method === 'GET') return Response.json([{ location_id: 'existing' }]);
      assert.equal(options.method, 'POST', 'never delete the location directory');
      assert.match(new Headers(options.headers).get('prefer'), /resolution=ignore-duplicates/);
      writes.push(JSON.parse(options.body));
      return new Response(null, { status: 201 });
    });
    const result = await scrapeLocations();
    assert.equal(result.discoveredCount, newLocation ? 1 : 0);
    assert.equal(writes.length, newLocation ? 1 : 0);
    assert.equal(geocodes, newLocation ? 1 : 0);
    assert.equal(visited.some((url) => url.includes('/existing/')), false);
    if (newLocation) {
      assert.equal(writes[0].location_id, 'new');
      assert.equal(writes[0].lat, 1.3);
      assert.equal(closed, true);
    }
  });
}

test('a failed run preserves saved locations so its retry does not geocode them again', async (t) => {
  setKey(t);
  const saved = new Map([['existing', { location_id: 'existing' }]]);
  const calls = [];
  let currentId;
  let fail = true;
  let closes = 0;
  t.mock.method(axios, 'get', async () => ({ data: '<select id="Location"><option value="existing">Existing</option><option value="first">First</option><option value="second">Second</option></select>' }));
  t.mock.method(Client.prototype, 'geocode', async ({ params }) => {
    calls.push(params.address);
    return { data: { status: 'OK', results: [{ geometry: { location: { lat: 1.3, lng: 103.8 } } }] } };
  });
  t.mock.method(puppeteer, 'launch', async () => ({ newPage: async () => ({
    goto: async (url) => {
      if (url.includes('/locations/')) {
        currentId = url.match(/locations\/([^/]+)/)[1];
        if (currentId === 'second' && fail) throw new Error('NAC unavailable');
      } else {
        assert.ok(saved.has(currentId), 'save geocoded coordinates before downloading images');
      }
      return imageResponse;
    },
    content: async () => `<div id="div-header"><ul><li class="dash-bx-times">${currentId} address</li></ul></div>`,
  }), close: async () => { closes++; } }));
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    assert.equal(new URL(input).pathname, '/rest/v1/locations');
    if (options.method === 'GET') return Response.json([...saved.values()]);
    assert.equal(options.method, 'POST');
    const row = JSON.parse(options.body);
    assert.equal(saved.has(row.location_id), false, 'existing locations must never be rewritten');
    saved.set(row.location_id, row);
    return new Response(null, { status: 201 });
  });
  await assert.rejects(scrapeLocations(), /NAC unavailable/);
  assert.ok(saved.has('first'));
  fail = false;
  await scrapeLocations();
  assert.deepEqual(calls, ['first address', 'second address']);
  assert.equal(saved.size, 3);
  assert.equal(closes, 2);
});
