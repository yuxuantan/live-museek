import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { Client } from '@googlemaps/google-maps-services-js';
import { LocationRefreshError, refreshBuskerById, refreshLocationById } from './nac_location_refresh.js';

// Exercise the real refresh flow with mocked NAC and Supabase network boundaries.
for (const scenario of ['image-only', 'embedded-image', 'invalid-embedded-image', 'upload-failure', 'download-failure', 'html-response', 'empty-image', 'no-image']) {
  test(`busker refresh: ${scenario}`, async (t) => {
    const buskerId = `image-regression-${scenario}`;
    const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const uploads = [];
    let imageDownloads = 0;
    const busker = {
      busker_id: buskerId, name: 'Musician', act: 'Solo', art_form: 'Music',
      bio: 'Same biography', socials: '',
    };

    t.mock.method(axios, 'get', async (url, options) => {
      if (url.includes('/busker/profile/')) {
        return { data: `<div id="div-header"><h2>Musician</h2><span>Solo</span><p>Same biography</p></div>
          <div class="card-details-bg"><ul><li></li><li></li><li>Art Form: <span>Music</span></li></ul></div>
          ${scenario === 'no-image' ? '' : '<img id="profileImage" src="/same-image.jpg">'}
          ${scenario === 'embedded-image' ? `<input id="profileImageHidden" value="data:image/jpeg;base64,${imageBytes.toString('base64')}">` : ''}
          ${scenario === 'invalid-embedded-image' ? '<input id="profileImageHidden" value="data:image/jpeg;base64,!!!">' : ''}` };
      }
      if (url.includes('/events/buskers/')) return { data: '' };
      assert.equal(url, 'https://eservices.nac.gov.sg/same-image.jpg');
      assert.equal(options.headers['Cache-Control'], 'no-cache');
      imageDownloads += 1;
      if (scenario === 'download-failure') throw new Error('NAC unavailable');
      return {
        data: scenario === 'empty-image' ? Buffer.alloc(0) : imageBytes,
        headers: { 'content-type': scenario === 'html-response' ? 'text/html' : 'image/jpeg' },
      };
    });
    t.mock.method(globalThis, 'fetch', async (input, options) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/rest/v1/')) {
        assert.equal(options.method, 'GET', 'unchanged profile and bookings must not be rewritten');
        return Response.json(url.pathname.endsWith('/buskers') ? [busker] : []);
      }
      assert.equal(url.pathname, `/storage/v1/object/busker_images/${buskerId}.jpg`);
      uploads.push(options);
      if (scenario === 'upload-failure') {
        return Response.json({ statusCode: '403', error: 'Forbidden', message: 'Upload denied' }, { status: 403 });
      }
      return Response.json({ Key: `busker_images/${buskerId}.jpg` });
    });
    t.mock.method(console, 'error', () => {});

    if (['upload-failure', 'download-failure', 'html-response', 'empty-image', 'invalid-embedded-image'].includes(scenario)) {
      await assert.rejects(refreshBuskerById(buskerId), (error) =>
        error instanceof LocationRefreshError && /NAC profile image/.test(error.message));
    } else {
      const result = await refreshBuskerById(buskerId);
      assert.deepEqual(result.changed, { busker: false, performances: false });
    }
    assert.equal(imageDownloads, ['no-image', 'embedded-image', 'invalid-embedded-image'].includes(scenario) ? 0 : 1);
    assert.equal(uploads.length, ['image-only', 'embedded-image', 'upload-failure'].includes(scenario) ? 1 : 0);
    if (uploads.length) assert.deepEqual(Buffer.from(uploads[0].body), imageBytes);
  });
}


test('location schedule refresh reuses saved coordinates and preserves historical performances without geocoding', async (t) => {
  const location = {
    location_id: 'location-reuse-regression', name: 'Test venue', address: '1 Example Road',
    area: 'Central', description: 'Busking spot', lat: 1.3, lng: 103.8,
  };
  t.mock.method(Client.prototype, 'geocode', () => assert.fail('unchanged address must not be geocoded'));
  const html = `<div id="div-header"><h1>Test venue</h1><ul><li class="dash-bx-times">1 Example Road</li></ul><p>Busking spot</p><span>Central</span></div>No Records found`;
  let closed = false;
  t.mock.method(puppeteer, 'launch', async () => ({
    newPage: async () => ({ goto: async () => {}, content: async () => html }),
    close: async () => { closed = true; },
  }));
  t.mock.method(axios, 'get', async (url) => {
    assert.equal(url, 'https://eservices.nac.gov.sg/Busking');
    return { data: `<select id="Location"><option value="${location.location_id}">Test venue</option></select>` };
  });
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.ok(url.pathname.startsWith('/rest/v1/'), 'must never call a geocoding service for an unchanged address');
    assert.equal(options.method, 'GET', 'must not rewrite unchanged location or delete historical bookings');
    return Response.json(url.pathname.endsWith('/locations') ? [location] : [{
      busker_id: 'past-busker', location_id: location.location_id,
      start_datetime: '2020-01-01T12:00:00Z', end_datetime: '2020-01-01T13:00:00Z',
    }]);
  });
  const result = await refreshLocationById(location.location_id);
  assert.deepEqual(result.changed, { location: false, performances: false });
  assert.equal(result.historicalPerformanceCountPreserved, 1);
  assert.equal(result.location.lat, location.lat);
  assert.equal(closed, true);
});
