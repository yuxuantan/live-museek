import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import puppeteer from 'puppeteer';
import { DEFAULT_LIMITS, createEventPage, loadNextEventPage, navigateReady, readLocationEvents, readLocations, parsePerformances } from './performance_browser.js';

const locationId = '50781054-7da9-427a-b76a-090113f0e463';
const base = 'https://eservices.nac.gov.sg/Busking';
const limits = { navigationAttempts: 2, navigationTimeoutMs: 2_000, readyTimeoutMs: 300,
  responseTimeoutMs: 500, downloadTimeoutMs: 500, retryDelayMs: 1, locationTimeoutMs: 5_000 };
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

// Real HTTP streaming is needed here: request.respond() sends headers and body together.
async function streamingFixture(t, scenario) {
  const timers = new Set();
  const server = createServer((request, response) => {
    if (request.url.startsWith('/events/more')) {
      response.writeHead(200, { 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff' });
      response.flushHeaders();
      response.write(' '); // Deliver successful headers while the body is still incomplete.
      if (scenario === 'stalled') return;
      const timer = setTimeout(() => {
        if (scenario === 'interrupted') response.destroy();
        else response.end(card(2));
      }, scenario === 'interrupted' ? 50 : 500);
      timers.add(timer);
    } else if (request.url === '/noise') {
      response.end('unrelated request completed');
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<input id="skip" value="12"><div id="div-booking-result-view">${card(1)}</div>
        <button id="div-load-booking-grid-more">Load more</button><script>
          document.querySelector('button').onclick = async () => {
            const button = document.querySelector('button');
            button.disabled = true;
            fetch('/noise');
            try {
              const response = await fetch('/events/more?skip=12&take=12');
              const body = await response.text();
              setTimeout(() => {
                document.querySelector('#div-booking-result-view').insertAdjacentHTML('beforeend', body);
                document.querySelector('#skip').value = '24';
                button.disabled = false;
              }, 20);
            } catch (_) { /* Keep the UI stuck, as a failed NAC callback can do. */ }
          };
        </script>`);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const page = await browser.newPage();
  t.after(async () => {
    await page.close();
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}/events`;
  await page.goto(url);
  return { page, url };
}

for (const scenario of ['slow-body', 'stalled', 'interrupted']) {
  test(`pagination handles ${scenario} after successful HTTP headers`, async (t) => {
    const { page, url } = await streamingFixture(t, scenario);
    let headersAt;
    let finishedAt;
    page.on('response', (response) => {
      if (response.url().includes('/events/more')) headersAt = Date.now();
    });
    page.on('requestfinished', (request) => {
      if (request.url().includes('/events/more')) finishedAt = Date.now();
    });
    const watched = ['request', 'response', 'requestfinished', 'requestfailed', 'close'];
    const beforeCounts = watched.map((event) => page.listenerCount(event));
    const operation = loadNextEventPage(page, url, { skip: '12', take: '12' }, {
      ...DEFAULT_LIMITS, readyTimeoutMs: 200, responseTimeoutMs: 2_000,
      downloadTimeoutMs: scenario === 'stalled' ? 150 : 2_000,
    }, Date.now() + 5_000);
    if (scenario === 'slow-body') {
      await operation;
      assert.ok(finishedAt - headersAt > 200, 'body takes longer than the render timeout after headers arrive');
      assert.equal(await page.$$eval('.col-cuttor', (cards) => cards.length), 2);
    } else {
      await assert.rejects(operation, scenario === 'stalled' ? /Pagination download timeout/ : /Pagination request failed/);
    }
    assert.deepEqual(watched.map((event) => page.listenerCount(event)), beforeCounts, 'temporary watchers are removed');
  });
}

test('a failed click removes pagination watchers without waiting for their timeout', async (t) => {
  const { page, url } = await streamingFixture(t, 'slow-body');
  await page.$eval('button', (button) => button.remove());
  const watched = ['request', 'response', 'requestfinished', 'requestfailed', 'close'];
  const beforeCounts = watched.map((event) => page.listenerCount(event));
  await assert.rejects(loadNextEventPage(page, url, { skip: '12', take: '12' }, DEFAULT_LIMITS, Date.now() + 5_000));
  assert.deepEqual(watched.map((event) => page.listenerCount(event)), beforeCounts);
});

test('page diagnostics report real failures and suppress intentionally blocked media', async (t) => {
  const messages = [];
  t.mock.method(console, 'warn', (message) => messages.push(message));
  const page = Object.assign(new EventEmitter(), {
    setRequestInterception: async () => {}, url: () => `${base}/events`,
  });
  await createEventPage({ newPage: async () => page }, 'test-location, attempt=2');
  const image = {
    resourceType: () => 'image', url: () => `${base}/photo.jpg`,
    failure: () => ({ errorText: 'net::ERR_FAILED' }),
    abort: async () => page.emit('requestfailed', image),
  };
  page.emit('request', image);
  assert.deepEqual(messages, []);
  page.emit('requestfailed', { url: () => `${base}/events/more`, failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) });
  page.emit('pageerror', new Error('NAC callback failed'));
  assert.equal(messages.length, 2);
  assert.match(messages[0], /test-location, attempt=2.*ERR_CONNECTION_RESET/);
  assert.match(messages[1], /test-location, attempt=2.*NAC callback failed/);
});
