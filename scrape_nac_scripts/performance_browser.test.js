import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import puppeteer from 'puppeteer';
import { DEFAULT_LIMITS, createEventPage, fetchEventBatch, navigateReady, readLocationEvents, readLocations, parsePerformances } from './performance_browser.js';

const locationId = '50781054-7da9-427a-b76a-090113f0e463';
const base = 'https://eservices.nac.gov.sg/Busking';
const limits = { navigationAttempts: 2, navigationTimeoutMs: 2_000, readyTimeoutMs: 300,
  responseTimeoutMs: 500, downloadTimeoutMs: 500, batchAttempts: 1, retryDelayMs: 1, locationTimeoutMs: 5_000 };
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
  const requestHeaders = [];
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
      requestHeaders.push(request.headers());
      if (scenario === 'no-response') return;
      if (scenario === 'http-error' || (scenario === 'recover-batch' && requests.length === 2)) status = 503;
      body = scenario === 'duplicate' ? card(1) : requests.length === 1 ? card(2) :
        scenario === 'recover-batch' && Number(url.searchParams.get('skip')) === 24 ? card(3) : '';
      body = JSON.stringify(body);
      if (scenario === 'invalid-json') body = '{';
      if (scenario === 'error-json') body = JSON.stringify({ error: 'unavailable' });
      if (scenario === 'unexpected-html') body = JSON.stringify('<h1>Service unavailable</h1>');
      if (scenario === 'wrong-content') body = '';
      // Match NAC's JSON-encoded HTML fragments, including the terminal empty string.
      setTimeout(() => request.respond({ status, contentType: scenario === 'wrong-content' ? 'text/html' : 'application/json', body }).catch(() => {}), 60);
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
  return { page, requests, requestHeaders, documents: () => documents };
}

test('pagination reads bounded JSON fragments without clicking the page UI', async (t) => {
  const { page, requests, requestHeaders } = await fixture(t);
  const rows = await readLocationEvents(page, locationId, limits);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['date', 'href', 'time']);
  assert.deepEqual(requests, [12, 24]);
  assert.ok(requestHeaders.every((headers) => !headers['x-requested-with']), 'do not request NAC base64 photo payloads');
  assert.equal(await page.evaluate(() => window.clicks), 0);
  assert.equal(parsePerformances(rows, locationId, 2026).length, 2);
});

test('valid empty location completes without pagination', async (t) => {
  const { page, requests } = await fixture(t, 'empty');
  assert.deepEqual(await readLocationEvents(page, locationId, limits), []);
  assert.deepEqual(requests, []);
});

for (const [scenario, error] of [
  ['http-error', /Pagination batch failed/],
  ['duplicate', /repeated events/],
  ['no-response', /Pagination batch failed/],
  ['invalid-json', /Pagination batch failed/],
  ['error-json', /Pagination batch failed/],
  ['unexpected-html', /Pagination batch failed/],
  ['wrong-content', /Pagination batch failed/],
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
  const { page } = await fixture(t, 'no-response');
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
  const requests = [];
  let aborted = 0;
  const server = createServer((request, response) => {
    if (request.url.startsWith('/events/more')) {
      requests.push(request.url);
      response.on('close', () => { if (!response.writableFinished) aborted++; });
      response.writeHead(200, { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' });
      response.flushHeaders();
      response.write('"'); // Deliver successful headers while the body is still incomplete.
      if (scenario === 'stalled' || (scenario === 'recover-stall' && requests.length === 1)) return;
      const timer = setTimeout(() => {
        if (scenario === 'interrupted') response.destroy();
        else response.end(JSON.stringify(card(2)).slice(1));
      }, ['interrupted', 'recover-stall'].includes(scenario) ? 50 : 500);
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
  return { page, url, requests, aborted: () => aborted };
}

test('a stalled body is cancelled before the same batch is retried successfully', async (t) => {
  const fixture = await streamingFixture(t, 'recover-stall');
  const batch = await fetchEventBatch(fixture.page, fixture.url, { skip: '204', take: '12' }, {
    ...limits, batchAttempts: 3, downloadTimeoutMs: 150, retryDelayMs: 20,
  }, Date.now() + 5_000);
  assert.equal(batch.rows.length, 1);
  assert.deepEqual(fixture.requests, ['/events/more?skip=204&take=12', '/events/more?skip=204&take=12']);
  assert.equal(fixture.aborted(), 1, 'the stalled response was actually cancelled');
});

test('batch byte limits reject a response before it can grow without bounds', async (t) => {
  const { page } = await fixture(t);
  await assert.rejects(readLocationEvents(page, locationId, { ...limits, maxBatchBytes: 10 }), (error) => {
    assert.match(error.cause.message, /Batch byte limit exceeded/);
    return true;
  });
});

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
    const operation = fetchEventBatch(page, url, { skip: '12', take: '12' }, {
      ...DEFAULT_LIMITS, batchAttempts: 1, readyTimeoutMs: 200, responseTimeoutMs: 2_000,
      downloadTimeoutMs: scenario === 'stalled' ? 150 : 2_000,
    }, Date.now() + 5_000);
    if (scenario === 'slow-body') {
      const batch = await operation;
      assert.ok(finishedAt - headersAt > 200, 'slow bodies are independent of the old render timeout');
      assert.equal(batch.rows.length, 1);
      assert.equal(batch.rows[0].href, '/Busking/busker/profile/busker-2');
      assert.equal(await page.$$eval('.col-cuttor', (cards) => cards.length), 1, 'batch HTML is never appended to the page');
    } else {
      await assert.rejects(operation, (error) => {
        assert.match(error.cause.message, scenario === 'stalled' ? /Pagination download timeout/ : /Pagination download failed/);
        return true;
      });
    }
    assert.deepEqual(watched.map((event) => page.listenerCount(event)), beforeCounts, 'temporary watchers are removed');
  });
}

test('a failed middle batch retries its cursor and retains all prior validated rows', async (t) => {
  const { page, requests } = await fixture(t, 'recover-batch');
  const rows = await readLocationEvents(page, locationId, { ...limits, batchAttempts: 3 });
  assert.deepEqual(requests, [12, 24, 24, 36]);
  assert.equal(rows.length, 3);
  assert.equal(await page.evaluate(() => window.clicks), 0);
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
  page.emit('requestfailed', {
    resourceType: () => 'fetch', url: () => `${base}/locations/id/events/more?skip=12&take=12`,
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  });
  assert.deepEqual(messages, [], 'controlled fetch failures use the batch outcome logger');
  page.emit('requestfailed', { url: () => `${base}/events/more`, failure: () => ({ errorText: 'net::ERR_CONNECTION_RESET' }) });
  page.emit('pageerror', new Error('NAC callback failed'));
  assert.equal(messages.length, 2);
  assert.match(messages[0], /test-location, attempt=2.*ERR_CONNECTION_RESET/);
  assert.match(messages[1], /test-location, attempt=2.*NAC callback failed/);
});
