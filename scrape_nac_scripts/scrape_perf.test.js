import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { scrapeWebsite } from './scrape_perf.js';

const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];

function harness(scenario = 'success') {
  const writes = [];
  const pages = [];
  let browserClosed = false;
  const visits = new Map();
  const launch = async () => ({
    close: async () => { browserClosed = true; },
    newPage: async () => {
      let url;
      let attempt;
      const page = Object.assign(new EventEmitter(), {
        closed: false,
        close: async () => { page.closed = true; },
        setRequestInterception: async () => {},
        goto: async (target, options) => {
          assert.equal(options.waitUntil, 'domcontentloaded');
          url = target;
          attempt = (visits.get(target) ?? 0) + 1;
          visits.set(target, attempt);
          return { ok: () => !(scenario === 'navigation' && target.includes(ids[1])), status: () => 503 };
        },
        url: () => url,
        waitForFunction: async () => ({ dispose: async () => {} }),
        $$eval: async () => scenario === 'directory' ? [] : ids.map((id, i) => ({ location_id: id, location_name: `Location ${i}` })),
        evaluate: async () => ({
          rows: scenario === 'empty' ? [] : [{ href: scenario === 'retry-pagination' && attempt === 1 && url.includes(ids[1])
            ? '/profile/discard-this-attempt' : '/profile/busker', date: '31 December',
            time: scenario === 'parse' && url.includes(ids[1]) ? 'invalid' : '10:00:AM-12:00:PM' }],
          empty: scenario === 'empty', more: url.includes(ids[1]) &&
            (scenario === 'pagination' || (scenario === 'retry-pagination' && attempt === 1)),
          disabled: false, skip: '12', take: '12',
        }),
        click: async () => {
          const request = {
            url: () => `${url}/more?skip=12&take=12`, method: () => 'GET',
            resourceType: () => 'xhr', continue: async () => {},
          };
          page.emit('request', request);
          page.emit('response', { request: () => request, ok: () => false, status: () => 503 });
        },
      });
      pages.push(page);
      return page;
    },
  });
  const supabase = { from: (table) => {
    assert.equal(table, 'performances');
    return {
      delete: () => ({ gte: async (column, value) => { writes.push({ type: 'delete', column, value }); return { error: null }; } }),
      insert: async (rows) => { writes.push({ type: 'insert', rows }); return { error: null }; },
    };
  } };
  return { writes, pages, closed: () => browserClosed,
    options: { argv: [], supabase, launch, browserOptions: { navigationAttempts: 1, retryDelayMs: 1 } } };
}

for (const scenario of ['navigation', 'pagination', 'parse', 'directory', 'empty']) {
  test(`${scenario} failure prevents ALL database writes and closes every tab`, async () => {
    const h = harness(scenario);
    await assert.rejects(scrapeWebsite(h.options), (error) => {
      if (scenario === 'pagination') assert.match(error.cause.cause.message, /Pagination HTTP 503/);
      return true;
    });
    assert.deepEqual(h.writes, []);
    assert.ok(h.closed());
    assert.ok(h.pages.every((page) => page.closed));
    if (scenario === 'pagination' || scenario === 'navigation') {
      assert.equal(h.pages.length, 5, 'directory, first location, then three fresh attempts for the failed location');
    }
  });
}

test('transient pagination failure restarts the location in a fresh tab without partial rows', async () => {
  const h = harness('retry-pagination');
  await scrapeWebsite(h.options);
  assert.equal(h.pages.length, 4);
  assert.ok(h.pages.every((page) => page.closed));
  assert.equal(h.writes[1].rows.length, 2);
  assert.ok(h.writes[1].rows.every((row) => row.busker_id === 'busker'));
});

test('location retry backoff consumes the shared deadline instead of resetting it', async () => {
  const h = harness('pagination');
  const start = Date.now();
  await assert.rejects(scrapeWebsite({ ...h.options, browserOptions: {
    navigationAttempts: 1, locationAttempts: 20, locationTimeoutMs: 40, retryDelayMs: 100,
  } }));
  assert.ok(Date.now() - start < 1_000);
  assert.ok(h.pages.length < 5, 'deadline prevents using all retry attempts');
  assert.deepEqual(h.writes, []);
  assert.ok(h.pages.every((page) => page.closed));
});

test('complete scrape refreshes current/future rows only after all tabs close', async () => {
  const h = harness();
  await scrapeWebsite(h.options);
  assert.equal(h.writes[0].type, 'delete');
  assert.equal(h.writes[0].column, 'end_datetime');
  assert.equal(h.writes[1].rows.length, 2);
  assert.ok(h.closed());
  assert.equal(h.pages.length, 3, 'directory and each location have separate tabs');
  assert.ok(h.pages.every((page) => page.closed));
});

for (const argv of [['--dry-run'], ['--limit=1']]) {
  test(`${argv[0]} preserves no-write behavior`, async () => {
    const h = harness();
    const result = await scrapeWebsite({ ...h.options, argv });
    assert.equal(result.written, false);
    assert.deepEqual(h.writes, []);
    assert.ok(h.closed());
  });
}
