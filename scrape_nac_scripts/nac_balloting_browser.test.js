import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { buildBallotingPlan, runBallotingPlan, verifyBallotingRun } from './auto_ballot.js';
import { getBookingSnapshot, installNacPageHelpers, selectBookingTimeRange, setBookingLocation } from './nac_booking_browser.js';
import { loadAllBallotingHistory, loadBallotingSlots, openBallotingModal, readBallotingHistory, selectBallotingSlot, submitBalloting, waitForBallotingDates } from './nac_balloting_browser.js';
import { BUSKING_DETAILS_URL } from './nac_common.js';

let browser;
before(async () => { browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-background-networking'] }); });
after(async () => { await browser?.close(); });
const expected = { locationName: 'AMK HUB', date: '2026-11-16', from: '19:00', to: '20:00' };

async function fixture(t, mode = 'success') {
  const page = await browser.newPage();
  t.after(() => page.isClosed() ? undefined : page.close());
  await page.setRequestInterception(true);
  page.on('request', (request) => request.abort());
  await page.setContent(`<button id="booking-button">Submit Booking</button><button id="balloting-button">Submit Balloting</button>
    <select id="hidden-booking-location" style="display:none"><option value="amk">AMK HUB</option></select>
    <div id="div-bookinglist"><div id="events"></div></div><div id="form" role="dialog" style="display:none">
    <h2>CREATE A BALLOTING</h2>
    <label>Location <select><option value="amk">AMK HUB</option><option value="paya">PAYA LEBAR SQUARE</option></select></label>
    <label>Card Type <input type="radio" name="card" checked>Individual</label>
    <label>Date <input value="16/11/2026"></label><button id="load">Load</button>
    <table><thead><tr><th>Slot</th><th>From</th><th>To</th><th>Select</th></tr></thead><tbody></tbody></table>
    <button id="submit">Submit</button><button>Cancel</button></div>`);
  await page.evaluate((mode) => {
    window.counts = { booking: 0, balloting: 0, submit: 0, confirm: 0, load: 0, successOk: 0, backdrop: 0, more: 0 };
    window.submitted = [];
    window.saved = [];
    const form = document.querySelector('#form');
    document.querySelector('#booking-button').onclick = () => window.counts.booking++;
    document.querySelector('#balloting-button').onclick = () => { window.counts.balloting++; form.style.display = ''; };
    window.renderSlots = () => {
      const label = (hour) => mode === 'radio-twelve-hour' ? `${hour - 12}:00 PM` : `${hour}:00`;
      document.querySelector('tbody').innerHTML = [18, 19, 20, 21].map((hour, index) =>
        `<tr><th scope="row">${index + 1}</th><td>${label(hour)}</td><td>${label(hour + 1)}</td><td><input type="radio" name="slot" ${hour === 18 ? 'checked' : ''}></td></tr>`).join('');
    };
    document.querySelector('#load').onclick = () => {
      window.counts.load++;
      if (mode !== 'stale-table') setTimeout(window.renderSlots, 40);
    };
    window.addTile = ({ location = 'AMK HUB', date = 'Mon, 16 November', from = '07:00:PM', to = '08:00:PM', status = 'PENDING' } = {}) => {
      const tile = document.createElement('article');
      tile.innerHTML = `<div>${status}</div><p>${date}</p><p>${from} - ${to}</p><a href="#">${location}</a>`;
      document.querySelector('#events').append(tile);
    };
    window.installHistory = (records, pageSize = 1) => {
      form.style.display = 'none';
      document.querySelector('#events').innerHTML = '';
      let next = 0;
      const append = () => records.slice(next, next += pageSize).forEach(window.addTile);
      append();
      if (next >= records.length) return;
      const more = document.createElement('button');
      more.textContent = 'Load More';
      more.id = 'more';
      more.onclick = () => {
        window.counts.more++;
        more.disabled = true;
        window.jQuery = { active: 1 };
        setTimeout(() => {
          append();
          if (next >= records.length) more.remove();
          else more.disabled = false;
          window.jQuery.active = 0;
        }, 40);
      };
      document.body.append(more);
    };
    const popup = (text, caption, action) => {
      const panel = document.createElement('div');
      panel.className = 'swal2-popup';
      panel.innerHTML = `<span>${text}</span><button>${caption}</button>`;
      document.body.append(panel);
      panel.querySelector('button').onclick = () => { panel.remove(); action?.(); };
      return panel;
    };
    const success = () => {
      const selected = form.querySelector('tr input[name="slot"]:checked').closest('tr');
      window.saved.push({ from: selected.children[1].textContent, to: selected.children[2].textContent });
      const container = document.createElement('div');
      container.className = 'swal2-container';
      container.style.cssText = 'position:fixed;inset:0';
      const panel = popup('Ballot created successfully.', 'OK');
      panel.querySelector('button').onclick = () => {
        window.counts.successOk++;
        container.remove();
        form.style.display = 'none';
      };
      container.append(panel);
      container.onclick = (event) => {
        if (event.target !== container) return;
        window.counts.backdrop++;
        if (mode !== 'cleanup-stuck') container.remove();
      };
      document.body.append(container);
    };
    document.querySelector('#submit').onclick = () => {
      window.counts.submit++;
      const checked = [...form.querySelectorAll('tr input:checked')];
      window.submitted.push(checked.map((radio) => radio.closest('tr').children[1].textContent));
      if (checked.length !== 1) throw new Error('Multiple slots submitted!');
      if (mode === 'confirmation') popup('Are you sure you want to create a balloting?', 'Yes', () => { window.counts.confirm++; success(); });
      else if (mode === 'rejected') popup('Event creation not successfully. Event creation is not successful.', 'OK');
      else if (mode === 'generic') popup('Success', 'OK');
      else if (mode === 'stale') return;
      else if (mode === 'tile-only') window.addTile();
      else if (mode === 'delayed-success') setTimeout(success, 350);
      else success();
    };
    window.renderSlots();
    if (mode === 'stale') popup('Ballot created successfully.', 'OK');
  }, mode);
  await openBallotingModal(page);
  await selectBallotingSlot(page, expected.from, expected.to);
  return page;
}

test('outside click dismisses success without OK and preserves the form and radio selection', async (t) => {
  const page = await fixture(t);
  const result = await submitBalloting(page, expected, { timeoutMs: 1_000 });
  assert.equal(result.outcome, 'confirmed');
  assert.equal(result.pendingVerified, false);
  assert.equal((await getBookingSnapshot(page)).found, true);
  assert.deepEqual(await page.evaluate(() => [window.counts.successOk, window.counts.backdrop, window.counts.submit]), [0, 1, 1]);
  assert.equal(await page.$eval('input[name="card"]', (radio) => radio.checked), true);
  await selectBallotingSlot(page, '20:00', '21:00');
  assert.equal(await page.$$eval('tr input:checked', (radios) => radios.length), 1);
  await assert.rejects(selectBallotingSlot(page, '19:00', '21:00'), /exactly one/);
});

test('all slots submit on one form before one final refresh, full pagination and history read', async (t) => {
  const page = await fixture(t);
  const plan = buildBallotingPlan({ ballots: [{ date: expected.date, time: '19:00-22:00', location_priority: ['AMK HUB'] }] });
  let refreshes = 0;
  let reads = 0;
  const { results, verification } = await runBallotingPlan(page, plan, {
    control: { submissionOptions: { timeoutMs: 1_500 } },
    resolve: async () => ({ name: 'AMK HUB', location_id: 'amk' }),
    verify: (page, results) => verifyBallotingRun(page, results, {
      timeoutMs: 1_000,
      refresh: async (page) => {
        refreshes++;
        assert.equal(await page.evaluate(() => window.counts.submit), 3);
        assert.equal(await page.$eval('#events', (events) => events.children.length), 0);
        await page.evaluate(() => window.installHistory([...window.saved,
          { location: 'PAYA LEBAR SQUARE' }, { location: 'OTHER VENUE' }], 1));
      },
      read: async (page, expected) => {
        reads++;
        // The requested slots are already on pages 1-3; pages 4-5 must load too.
        assert.equal(await page.$('#more'), null);
        assert.equal(await page.evaluate(() => window.counts.more), 4);
        return readBallotingHistory(page, expected);
      },
    }),
  });
  assert.equal(refreshes, 1);
  assert.equal(reads, 1);
  assert.equal(verification.success, true);
  assert.equal(verification.pagesLoaded, 5);
  assert.ok(results.every((result) => result.pendingVerified && result.status === 'PENDING'));
  assert.deepEqual(await page.evaluate(() => window.submitted), [['19:00'], ['20:00'], ['21:00']]);
  assert.deepEqual(await page.evaluate(() => [window.counts.booking, window.counts.balloting, window.counts.load, window.counts.successOk]), [0, 1, 1, 0]);
});

test('location selection excludes hidden booking controls', async (t) => {
  const page = await fixture(t);
  await setBookingLocation(page, { locationId: 'paya', locationName: 'PAYA LEBAR SQUARE' });
  assert.equal((await getBookingSnapshot(page)).locationText, 'PAYA LEBAR SQUARE');
  assert.equal(await page.$eval('#hidden-booking-location', (select) => select.value), 'amk');
});

test('date selection waits for location-date AJAX completion', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    window.jQuery = { active: 1 };
    setTimeout(() => { document.querySelector('#form input:not([type="radio"])').value = '17/11/2026'; window.jQuery.active = 0; }, 100);
  });
  await waitForBallotingDates(page, 1_000);
  assert.equal((await getBookingSnapshot(page)).dateKey, '2026-11-17');
});

test('12-hour rows select the configured 24-hour slot', async (t) => {
  const page = await fixture(t, 'radio-twelve-hour');
  assert.equal((await submitBalloting(page, expected, { timeoutMs: 1_000 })).outcome, 'confirmed');
  assert.deepEqual(await page.evaluate(() => window.submitted), [['7:00 PM']]);
});

test('optional confirmation is clicked once', async (t) => {
  const page = await fixture(t, 'confirmation');
  assert.equal((await submitBalloting(page, expected, { timeoutMs: 1_000 })).success, true);
  assert.deepEqual(await page.evaluate(() => [window.counts.submit, window.counts.confirm, window.counts.successOk]), [1, 1, 0]);
});

for (const mode of ['stale', 'generic', 'tile-only']) {
  test(`${mode} does not replace explicit submission feedback or cause retry`, async (t) => {
    const page = await fixture(t, mode);
    await assert.rejects(submitBalloting(page, expected, { timeoutMs: 250 }), (error) => error.stopQueue && error.outcome === 'unknown');
    assert.equal(await page.evaluate(() => window.counts.submit), 1);
  });
}

test('a stuck success popup preserves submission confirmation and never falls back to OK', async (t) => {
  const page = await fixture(t, 'cleanup-stuck');
  await assert.rejects(submitBalloting(page, expected, { cleanupTimeoutMs: 350 }), (error) => error.stopQueue && error.outcome === 'confirmed');
  assert.equal(await page.evaluate(() => window.counts.successOk), 0);
});

test('definite rejection is dismissed and returned', async (t) => {
  const page = await fixture(t, 'rejected');
  assert.equal((await submitBalloting(page, expected, { timeoutMs: 1_000 })).outcome, 'rejected');
  assert.equal(await page.$('.swal2-popup'), null);
});

test('delayed explicit success is awaited without resubmitting', { timeout: 3_000 }, async (t) => {
  const page = await fixture(t, 'delayed-success');
  assert.equal((await submitBalloting(page, expected)).success, true);
  assert.equal(await page.evaluate(() => window.counts.submit), 1);
});

for (const [name, records, status] of [
  ['12-hour time', [{}], 'PENDING'], ['year', [{ date: 'Mon, 16 November 2026' }], 'PENDING'],
  ['wrong date', [{ date: 'Tue, 17 November' }], null], ['wrong year', [{ date: 'Mon, 16 November 2027' }], null],
  ['wrong venue', [{ location: 'PAYA LEBAR SQUARE' }], null], ['wrong slot', [{ from: '08:00:PM', to: '09:00:PM' }], null],
  ['published', [{ status: 'PUBLISHED' }], 'PUBLISHED'],
  ['split tiles', [{ date: 'Tue, 17 November' }, { location: 'PAYA LEBAR SQUARE' }], null],
]) {
  test(`final history check: ${name}`, async (t) => {
    const page = await fixture(t);
    await page.evaluate((records) => window.installHistory(records, 10), records);
    await loadAllBallotingHistory(page, { timeoutMs: 1_000 });
    const [check] = await readBallotingHistory(page, [expected]);
    assert.equal(check.status, status);
    assert.equal(check.pendingVerified, status === 'PENDING');
    assert.equal(await page.evaluate(() => window.counts.submit), 0);
  });
}

test('stalled pagination fails without claiming history is complete', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    document.querySelector('#form').style.display = 'none';
    const more = document.createElement('button'); more.textContent = 'Load More';
    document.body.append(more);
  });
  await assert.rejects(loadAllBallotingHistory(page, { timeoutMs: 250 }), /Waiting failed/);
});

test('a temporarily hidden Load More button is not mistaken for the end of history', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    document.querySelector('#form').style.display = 'none';
    const more = document.createElement('button'); more.textContent = 'Load More';
    more.onclick = () => {
      more.style.display = 'none';
      setTimeout(() => { window.addTile(); more.remove(); }, 350);
    };
    document.body.append(more);
  });
  const history = await loadAllBallotingHistory(page, { timeoutMs: 1_000 });
  assert.equal(history.complete, true);
  assert.equal(await page.$eval('#events', (events) => events.children.length), 1);
});

test('an empty final AJAX page completes pagination only after its request finishes', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    document.querySelector('#form').style.display = 'none';
    const more = document.createElement('button'); more.textContent = 'Load More';
    more.onclick = () => {
      window.jQuery = { active: 1 };
      more.style.display = 'none';
      setTimeout(() => { window.jQuery.active = 0; more.remove(); }, 250);
    };
    document.body.append(more);
  });
  assert.equal((await loadAllBallotingHistory(page, { timeoutMs: 1_000 })).complete, true);
  assert.equal(await page.evaluate(() => window.jQuery.active), 0);
});

test('missing final tiles are reported after full history load without resubmission', async (t) => {
  const page = await fixture(t);
  await submitBalloting(page, expected, { timeoutMs: 1_000 });
  const result = { request: expected, location: { name: 'AMK HUB' }, success: true, outcome: 'confirmed' };
  const verification = await verifyBallotingRun(page, [result], {
    timeoutMs: 1_000, refresh: async () => {},
  });
  assert.equal(verification.success, false);
  assert.equal(verification.missing.length, 1);
  assert.equal(result.outcome, 'confirmed');
  assert.equal(await page.evaluate(() => window.counts.submit), 1);
});

test('final verification refreshes the details page once and uses the new history', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  let navigations = 0;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.url() === BUSKING_DETAILS_URL) {
      navigations++;
      return request.respond({ status: 200, contentType: 'text/html', body: `<button>Submit Balloting</button>
        <div id="div-bookinglist">${navigations > 1 ? '<article><div>PENDING</div><p>Mon, 16 November</p><p>07:00:PM - 08:00:PM</p><a>AMK HUB</a></article>' : ''}</div>` });
    }
    return request.abort();
  });
  await page.goto(BUSKING_DETAILS_URL, { waitUntil: 'domcontentloaded' });
  const results = [{ request: expected, location: { name: 'AMK HUB' }, success: true, outcome: 'confirmed' }];
  const verification = await verifyBallotingRun(page, results, { timeoutMs: 1_000 });
  assert.equal(navigations, 2);
  assert.equal(verification.success, true);
  assert.equal(results[0].pendingVerified, true);
});

test('Load requires refreshed rows and disabled radios fail before submission', async (t) => {
  const page = await fixture(t, 'stale-table');
  await assert.rejects(loadBallotingSlots(page, '19:00', '20:00', { timeoutMs: 250 }), /Waiting failed/);
  await page.evaluate(() => { document.querySelectorAll('tr input')[1].disabled = true; });
  await assert.rejects(selectBallotingSlot(page, '19:00', '20:00'), /unavailable/);
  assert.equal(await page.evaluate(() => window.counts.submit), 0);
});

test('booking mode retains checkbox behavior', async (t) => {
  const page = await fixture(t);
  await page.evaluate(() => {
    document.querySelector('h2').textContent = 'CREATE A BOOKING';
    document.querySelectorAll('tr input').forEach((input) => { input.type = 'checkbox'; });
  });
  await installNacPageHelpers(page);
  await selectBookingTimeRange(page, '19:00', '21:00');
  assert.equal(await page.$$eval('tr input:checked', (radios) => radios.length), 2);
});
