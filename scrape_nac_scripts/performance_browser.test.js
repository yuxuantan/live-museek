import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import puppeteer from 'puppeteer';
import { navigateReady, readLocationEvents, readLocations, parsePerformances } from './performance_browser.js';

const locationId = '50781054-7da9-427a-b76a-090113f0e463';
const base = 'https://eservices.nac.gov.sg/Busking';
const limits = { navigationAttempts: 2, navigationTimeoutMs: 2_000, readyTimeoutMs: 300,
  responseTimeoutMs: 500, retryDelayMs: 1, locationTimeoutMs: 5_000 };
let browser;
before(async () => { browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }); });
after(async () => { await browser?.close(); });

function card(id) {
  return `<div class="col-cuttor"><div class="dash-bx"><h3><a href="/Busking/busker/profile/busker-${id}">Busker</a></h3>
    <ul class="dash-bx-times"><li>Sun, 27 September</li><li>10:00:AM-12:00:PM</li></ul></div></div>`;
}

async function fixture(t, scenario = 'success') {
  const page = await browser.newPage();
  t.after(() => page.close());
  const requests = [];
  let documents = 0;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/never-finishes.png') return; // Pending until the tab closes.
    if (url.pathname === '/favicon.ico') {
      request.respond({ status: 204 }).catch(() => {});
      return;
    }
    let body;
    let status = 200;
    if (url.pathname.endsWith('/events/more')) {
      requests.push(Number(url.searchParams.get('skip')));
      if (scenario === 'http-error') status = 503;
      body = scenario === 'duplicate' ? card(1) : scenario === 'stalled' ? '' : requests.length === 1 ? card(2) : '';
      // Slow response plus delayed rendering exercises both waits, with only one click per request.
      setTimeout(() => request.respond({ status, contentType: 'text/html', body }).catch(() => {}), 60);
      return;
    }
    if (url.pathname.endsWith('/events')) {
      body = `<input id="locationId" value="${locationId}"><input id="skip" value="12"><input id="take" value="12">
        ${scenario === 'empty' ? '<div>No Records found</div>' : `<div id="div-booking-result-view">${card(1)}</div>
        <button id="div-load-booking-grid-more">Load more</button>`}
        <script>
          window.clicks = 0;
          const button = document.querySelector('button');
          if (button) button.onclick = async () => {
            window.clicks++;
            button.disabled = true;
            const skip = document.querySelector('#skip');
            const response = await fetch(location.pathname + '/more?skip=' + skip.value + '&take=12');
            if (!response.ok) { button.disabled = false; return; }
            const text = await response.text();
            if ('${scenario}' === 'no-render') return;
            setTimeout(() => {
              document.querySelector('#div-booking-result-view').insertAdjacentHTML('beforeend', text);
              skip.value = Number(skip.value) + 12;
              if ((!text && '${scenario}' !== 'stalled') || '${scenario}' === 'duplicate') button.style.display = 'none';
              button.disabled = false;
            }, 60);
          };
        </script>`;
    } else {
      documents++;
      body = (scenario === 'bad-directory' || (scenario === 'retry-directory' && documents === 1))
        ? '<h1>Temporarily unavailable</h1>'
        : `<select id="Location"><option value="00000000-0000-0000-0000-000000000000">All</option>
          <option value="${locationId}">One Holland Village</option></select>`;
      if (scenario === 'slow-image') body += '<img src="/never-finishes.png">';
    }
    request.respond({ status, contentType: 'text/html', body }).catch(() => {});
  });
  return { page, requests, documents: () => documents };
}

test('pagination waits for response AND DOM, including the terminal empty batch', async (t) => {
  const { page, requests } = await fixture(t);
  const rows = await readLocationEvents(page, locationId, limits);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['date', 'href', 'time']);
  assert.deepEqual(requests, [12, 24]);
  assert.equal(await page.evaluate(() => window.clicks), 2);
  assert.equal(parsePerformances(rows, locationId, 2026).length, 2);
});

test('valid empty location completes without pagination', async (t) => {
  const { page, requests } = await fixture(t, 'empty');
  assert.deepEqual(await readLocationEvents(page, locationId, limits), []);
  assert.deepEqual(requests, []);
});

for (const [scenario, error] of [
  ['http-error', /Pagination HTTP 503/],
  ['duplicate', /repeated events/],
  ['stalled', /no progress/],
  ['no-render', /Waiting failed/],
]) {
  test(`pagination fails closed for ${scenario}`, async (t) => {
    const { page, requests } = await fixture(t, scenario);
    await assert.rejects(readLocationEvents(page, locationId, limits), error);
    assert.equal(requests.length, 1, 'never click again after a failed batch');
  });
}

test('pagination page and event limits abort incomplete results', async (t) => {
  const { page, requests } = await fixture(t);
  await assert.rejects(readLocationEvents(page, locationId, { ...limits, maxPages: 1 }), /Pagination limit/);
  assert.deepEqual(requests, [12]);
  const second = await fixture(t);
  await assert.rejects(readLocationEvents(second.page, locationId, { ...limits, maxEvents: 1 }), /Event limit/);
});

test('location deadline bounds a stalled response/render', async (t) => {
  const { page } = await fixture(t, 'no-render');
  const start = Date.now();
  await assert.rejects(readLocationEvents(page, locationId, { ...limits, locationTimeoutMs: 200, readyTimeoutMs: 5_000 }));
  assert.ok(Date.now() - start < 2_000);
});

test('directory readiness retries transient missing content', async (t) => {
  const { page, documents } = await fixture(t, 'retry-directory');
  assert.deepEqual(await readLocations(page, limits), [{ location_id: locationId, location_name: 'One Holland Village' }]);
  assert.equal(documents(), 2);
});

test('invalid directory fails after bounded attempts', async (t) => {
  const { page, documents } = await fixture(t, 'bad-directory');
  await assert.rejects(readLocations(page, limits), /Failed to load validated directory/);
  assert.equal(documents(), 2);
});

test('navigation does not wait for a hanging image', async (t) => {
  const { page } = await fixture(t, 'slow-image');
  await navigateReady(page, `${base}/`, 'directory', null, limits);
  assert.equal(await page.evaluate(() => document.readyState), 'interactive');
});

test('malformed event text cannot silently remove a booking', () => {
  for (const date of ['bad date', '31 February', '0 September']) {
    assert.throws(() => parsePerformances([{ href: '/profile/id', date, time: '10:00:AM-12:00:PM' }], locationId), /Invalid event/);
  }
});
