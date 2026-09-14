import assert from 'node:assert/strict';
import { test } from 'node:test';
import axios from 'axios';
import { LocationRefreshError, refreshBuskerById } from './nac_location_refresh.js';

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
