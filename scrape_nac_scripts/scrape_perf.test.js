import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scrapeWebsite } from './scrape_perf.js';

const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];

function harness(scenario = 'success') {
  const writes = [];
  const pages = [];
  let browserClosed = false;
  const launch = async () => ({
    close: async () => { browserClosed = true; },
    newPage: async () => {
      let url;
      const page = {
        closed: false,
        close: async () => { page.closed = true; },
        setRequestInterception: async () => {},
        on: () => {},
        goto: async (target, options) => {
          assert.equal(options.waitUntil, 'domcontentloaded');
          url = target;
          return { ok: () => !(scenario === 'navigation' && target.includes(ids[1])), status: () => 503 };
        },
        url: () => url,
        waitForFunction: async () => ({ dispose: async () => {} }),
        $$eval: async () => scenario === 'directory' ? [] : ids.map((id, i) => ({ location_id: id, location_name: `Location ${i}` })),
        evaluate: async () => ({
          rows: scenario === 'empty' ? [] : [{ href: '/profile/busker', date: '31 December',
            time: scenario === 'parse' && url.includes(ids[1]) ? 'invalid' : '10:00:AM-12:00:PM' }],
          empty: scenario === 'empty', more: scenario === 'pagination' && url.includes(ids[1]),
          disabled: false, skip: '12', take: '12',
        }),
        waitForResponse: async () => ({ ok: () => false, status: () => 503 }),
        click: async () => {},
      };
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
    options: { argv: [], supabase, launch, browserOptions: { navigationAttempts: 1 } } };
}

for (const scenario of ['navigation', 'pagination', 'parse', 'directory', 'empty']) {
  test(`${scenario} failure prevents ALL database writes and closes every tab`, async () => {
    const h = harness(scenario);
    await assert.rejects(scrapeWebsite(h.options));
    assert.deepEqual(h.writes, []);
    assert.ok(h.closed());
    assert.ok(h.pages.every((page) => page.closed));
  });
}

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
