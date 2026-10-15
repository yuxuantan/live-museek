import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer';
import { BookingSubmissionError, selectBookingDate, setBookingLocation, submitBooking, ensureAuthenticatedBuskingDetailsPage, installNacPageHelpers, selectBookingTimeRange } from './nac_booking_browser.js';
import { attemptPriorityBooking } from './auto_book.js';
import { createLimiter, runBookingQueue } from './nac_booking_queue.js';
import { BUSKING_DETAILS_URL, BEFORE_LOGIN_URL } from './nac_common.js';

let browser;
before(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
});
after(async () => { await browser?.close(); });

async function fixture(t, mode) {
  const page = await browser.newPage();
  t.after(() => page.isClosed() ? undefined : page.close());
  // No NAC session, network navigation, or remote resources in these fixtures.
  await page.setRequestInterception(true);
  page.on('request', (request) => request.abort());
  await page.setContent(`<div>Previously booked. Confirmed performances.</div>
    <div class="alert">Your booking was created successfully.</div>
    <div id="booking" role="dialog"><button id="submit">Submit</button></div>`);
  await page.evaluate((mode) => {
    window.counts = { submit: 0, confirm: 0 };
    window.rejectionOkClicks = 0;
    const booking = document.querySelector('#booking');
    const popup = (text, buttonText = 'OK') => {
      const element = document.createElement('div');
      element.className = 'swal2-popup';
      element.textContent = text;
      const button = document.createElement('button');
      button.textContent = buttonText;
      element.append(button);
      document.body.append(element);
      return { element, button };
    };
    const succeed = () => {
      const { element, button } = popup(mode === 'alternate-wording'
        ? 'Your booking has been successfully created.' : 'Your booking has been created successfully.');
      if (mode.startsWith('swal-container')) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('role', 'dialog');
        wrapper.style.cssText = 'position:fixed;inset:0';
        const container = document.createElement('div');
        container.className = 'swal2-container';
        container.style.cssText = 'position:fixed;inset:0';
        element.style.cssText = 'position:fixed;left:100px;top:100px;width:300px;height:100px';
        container.append(element);
        wrapper.append(container);
        document.body.append(wrapper);
        window.backdropClicks = 0;
        window.successOkClicks = 0;
        // NAC's loaded SweetAlert handler requires event.target === container.
        container.onclick = (event) => {
          if (event.target !== container) return;
          window.backdropClicks += 1;
          if (mode === 'swal-container-ignore-first' && window.backdropClicks === 1) return;
          element.classList.add('swal2-hide');
          setTimeout(() => {
            if (mode === 'swal-container-hidden-parent') container.style.opacity = '0';
            else container.remove();
          }, 80);
        };
        button.onclick = () => { window.successOkClicks += 1; };
        return;
      }
      if (mode === 'backdrop') {
        button.remove();
        element.style.cssText = 'position:fixed;left:100px;top:100px;width:300px;height:100px';
        document.addEventListener('click', (event) => {
          if (event.target.id === 'submit') return;
          if (!element.contains(event.target)) { element.remove(); booking.remove(); }
        });
      }
      button.onclick = () => {
        if (mode === 'cleanup-failure') return;
        element.remove();
        if (!['form-remains', 'delayed-success'].includes(mode)) booking.remove();
      };
    };
    const reject = () => {
      const { element, button } = popup(mode === 'rejected'
        ? 'Booking was not successful. Please try again.' : 'Event creation not successful');
      button.onclick = () => {
        window.rejectionOkClicks += 1;
        if (mode !== 'rejection-stuck') setTimeout(() => element.remove(), 50);
      };
    };
    window.succeed = succeed;
    window.__liveMuseekNacHelpers = {
      findBookingRoot: () => document.querySelector('#booking'),
      clickBookingButton: () => { document.querySelector('#submit').click(); return true; },
    };
    document.querySelector('#submit').onclick = () => {
      window.counts.submit += 1;
      console.log('fixture-submit');
      if (mode.startsWith('swal-container') || ['immediate', 'cleanup-failure', 'alternate-wording', 'backdrop', 'form-remains'].includes(mode)) succeed();
      else if (mode === 'delayed-success') setTimeout(succeed, 16_000);
      else if (mode === 'delayed-confirmation') {
        setTimeout(() => {
          const { element, button } = popup('Are you sure you want to create a booking?', 'Yes');
          button.onclick = () => {
            window.counts.confirm += 1;
            element.remove();
            setTimeout(succeed, 800);
          };
        }, 800);
      }
      else if (['confirmation', 'stop-before-confirmation', 'event-rejected-confirmation'].includes(mode)) {
        const { element, button } = popup('Are you sure you want to create a booking?', 'Yes');
        button.onclick = () => {
          window.counts.confirm += 1;
          element.remove();
          setTimeout(mode === 'event-rejected-confirmation' ? reject : succeed, 20);
        };
      } else if (['rejected', 'event-rejected', 'rejection-stuck'].includes(mode)) reject();
      else if (mode === 'already-created') popup('Booking already created.');
      else if (mode === 'disappeared') booking.remove();
      else if (mode === 'unrelated') popup('Successfully updated your profile.');
      else if (mode === 'generic') popup('Success');
    };
  }, mode);
  return page;
}

test('immediate explicit success completes without waiting for an optional confirmation', async (t) => {
  const page = await fixture(t, 'immediate');
  const result = await submitBooking(page, { timeoutMs: 700 });
  assert.equal(result.outcome, 'confirmed');
  assert.deepEqual(await page.evaluate(() => window.counts), { submit: 1, confirm: 0 });
});

test('confirmation is clicked once and its subsequent explicit success is captured', async (t) => {
  const page = await fixture(t, 'confirmation');
  assert.equal((await submitBooking(page, { timeoutMs: 1_000 })).success, true);
  assert.deepEqual(await page.evaluate(() => window.counts), { submit: 1, confirm: 1 });
});

test('success after the former 15-second deadline resumes queued bookings without resubmitting', { timeout: 25_000 }, async (t) => {
  const page = await fixture(t, 'delayed-success');
  const control = {};
  const attempted = [];
  const notices = [];
  const originalLog = console.log;
  t.mock.method(console, 'log', (...args) => {
    if (String(args[0]).includes('Booking outcome pending')) {
      notices.push(String(args[0]));
      assert.deepEqual(attempted, ['booking-1']);
      assert.equal(Boolean(control.stopped), false);
    } else originalLog(...args);
  });
  const requests = [1, 2].map((day) => ({
    label: `booking-${day}`, date: `2026-11-0${day}`, from: '11:00', to: '14:00',
    locationPriority: [{ name: 'first' }],
  }));
  const results = await runBookingQueue({
    requests, pages: [page], control, stopOnFailure: false,
    attempt: (page, request) => attemptPriorityBooking(page, request, {
      control, limit: createLimiter(1), resolve: async (entry) => entry, precheck: async () => {},
      book: async () => {
        attempted.push(request.label);
        if (request.label === 'booking-2') {
          await page.evaluate(() => {
            document.querySelector('#submit').onclick = () => { window.counts.submit += 1; window.succeed(); };
          });
        }
        return submitBooking(page);
      },
    }),
  });
  assert.equal(results.every((result) => result.success), true);
  assert.deepEqual(attempted, ['booking-1', 'booking-2']);
  assert.equal(notices.length, 1);
  assert.equal(await page.evaluate(() => window.counts.submit), 2);
  assert.ok(results[0].timings.feedbackMs >= 15_000);
  assert.ok(results[0].timings.totalMs >= results[0].timings.feedbackMs);
});

test('confirmation and result have independent configurable deadlines', async (t) => {
  const page = await fixture(t, 'delayed-confirmation');
  const result = await submitBooking(page, { confirmationTimeoutMs: 1_300, resultTimeoutMs: 1_300 });
  assert.equal(result.outcome, 'confirmed');
  assert.ok(result.timings.feedbackMs > 1_300);
  assert.ok(result.timings.feedbackMs - result.timings.confirmationClickedMs >= 800);
  assert.deepEqual(await page.evaluate(() => window.counts), { submit: 1, confirm: 1 });
});

test('an explicit result timeout preserves uncertainty and never retries the submission', async (t) => {
  const page = await fixture(t, 'delayed-confirmation');
  await assert.rejects(submitBooking(page, { confirmationTimeoutMs: 2_000, resultTimeoutMs: 100 }), (error) =>
    error.outcome === 'unknown' && error.stopQueue && /Waiting for booking result/.test(error.message) &&
    error.timings.confirmationClickedMs >= 0
  );
  assert.deepEqual(await page.evaluate(() => window.counts), { submit: 1, confirm: 1 });
});

test('late explicit rejection remains pending then advances to the next location', async (t) => {
  const page = await fixture(t, 'stale');
  const locations = [];
  const control = {};
  let pendingNotices = 0;
  const originalLog = console.log;
  t.mock.method(console, 'log', (...args) => {
    if (String(args[0]).includes('Booking outcome pending')) {
      pendingNotices += 1;
      assert.deepEqual(locations, ['first']);
      assert.equal(Boolean(control.stopped), false);
    } else originalLog(...args);
  });
  const result = await attemptPriorityBooking(page, {
    label: 'fixture', date: '2026-11-01', from: '11:00', to: '14:00',
    locationPriority: [{ name: 'first' }, { name: 'second' }],
  }, {
    control, limit: createLimiter(1), resolve: async (entry) => entry, precheck: async () => {},
    book: async (page, location) => {
      locations.push(location.name);
      await page.evaluate((first) => {
        document.querySelector('#submit').onclick = () => {
          window.counts.submit += 1;
          if (!first) { window.succeed(); return; }
          setTimeout(() => {
            const panel = document.createElement('div');
            panel.className = 'swal2-popup';
            panel.innerHTML = 'Event creation not successful<button>OK</button>';
            panel.querySelector('button').onclick = () => panel.remove();
            document.body.append(panel);
          }, 350);
        };
      }, location.name === 'first');
      return submitBooking(page, { progressIntervalMs: 100 });
    },
  });
  assert.equal(result.success, true);
  assert.deepEqual(locations, ['first', 'second']);
  assert.ok(pendingNotices > 0);
  assert.equal(await page.evaluate(() => window.counts.submit), 2);
  assert.equal(result.errors[0].stage, 'submission-rejected');
  assert.ok(result.errors[0].timings.feedbackMs >= 350);
});

for (const loss of ['close', 'navigation']) {
  test(`${loss} during an unbounded pending wait stops the queue with an unknown outcome`, async (t) => {
    const page = await fixture(t, 'stale');
    const control = {};
    const requests = [1, 2].map((day) => ({
      label: `booking-${day}`, date: `2026-11-0${day}`, from: '11:00', to: '14:00',
      locationPriority: [{ name: 'first' }],
    }));
    const attempted = [];
    const run = runBookingQueue({
      requests, pages: [page], control, stopOnFailure: false,
      attempt: (page, request) => attemptPriorityBooking(page, request, {
        control, limit: createLimiter(1), resolve: async (entry) => entry, precheck: async () => {},
        book: async () => { attempted.push(request.label); return submitBooking(page); },
      }),
    });
    await page.waitForFunction(() => window.counts.submit === 1);
    if (loss === 'close') await page.close();
    else await page.goto('about:blank');
    const results = await run;
    assert.deepEqual(attempted, ['booking-1']);
    assert.equal(results[0].outcome, 'unknown');
    assert.equal(results[1].outcome, 'not-started');
    assert.equal(control.stopReason.outcome, 'unknown');
    assert.ok(results[0].timings.totalMs >= 0);
  });
}

for (const status of [200, 401]) {
  test(`HTTP ${status}: records headers/body timing without treating HTTP success as booking confirmation`, async (t) => {
    const server = createServer((request, response) => {
      if (request.method === 'POST') {
        response.writeHead(status, { 'Content-Type': 'text/plain' });
        response.write('fixture response');
        setTimeout(() => response.end(), 200);
      } else {
        response.end('<div id="booking" role="dialog"><button id="submit">Submit</button></div>');
      }
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.setRequestInterception(true);
    page.on('request', (request) => request.url().startsWith(`${origin}/`) ? request.continue() : request.abort());
    await page.goto(`${origin}/Busking/busker/details`);
    await page.evaluate(() => {
      window.counts = { submit: 0 };
      window.__liveMuseekNacHelpers = {
        findBookingRoot: () => document.querySelector('#booking'),
        clickBookingButton: () => { document.querySelector('#submit').click(); return true; },
      };
      document.querySelector('#submit').onclick = () => {
        window.counts.submit += 1;
        fetch('/Busking/bookings/create?private=omit-me', { method: 'POST' }).then((response) => {
          if (!response.ok) return;
          return response.text().then(() => setTimeout(() => {
            const popup = document.createElement('div');
            popup.className = 'swal2-popup';
            popup.innerHTML = 'Booking created successfully.<button>OK</button>';
            popup.querySelector('button').onclick = () => popup.remove();
            document.body.append(popup);
          }, 300));
        });
      };
    });
    const events = ['request', 'response', 'requestfinished', 'requestfailed', 'close', 'error', 'framenavigated'];
    const listenerCounts = events.map((event) => page.listenerCount(event));
    const disconnectedListeners = browser.listenerCount('disconnected');
    let timings;
    if (status === 200) {
      const result = await submitBooking(page);
      assert.equal(result.outcome, 'confirmed');
      timings = result.timings;
      assert.ok(timings.requests[0].finishedMs > timings.requests[0].headersMs);
      assert.ok(timings.feedbackMs - timings.requests[0].finishedMs >= 250);
    } else {
      await assert.rejects(submitBooking(page), (error) => {
        timings = error.timings;
        return error.outcome === 'unknown' && error.stopQueue && /HTTP 401/.test(error.message);
      });
    }
    assert.equal(timings.requests.length, 1);
    assert.equal(timings.requests[0].status, status);
    assert.equal(timings.requests[0].path, '/Busking/bookings/create');
    assert.equal(JSON.stringify(timings).includes('omit-me'), false);
    assert.equal(await page.evaluate(() => window.counts.submit), 1);
    assert.deepEqual(events.map((event) => page.listenerCount(event)), listenerCounts);
    assert.equal(browser.listenerCount('disconnected'), disconnectedListeners);
  });
}

test('explicit alternate success wording is accepted', async (t) => {
  const page = await fixture(t, 'alternate-wording');
  assert.equal((await submitBooking(page)).outcome, 'confirmed');
});

test('buttonless confirmed popup is dismissed and its disappearance awaited', async (t) => {
  const page = await fixture(t, 'backdrop');
  assert.equal((await submitBooking(page)).outcome, 'confirmed');
});

for (const mode of ['swal-container', 'swal-container-ignore-first', 'swal-container-hidden-parent']) {
  test(`${mode}: dismisses the exact backdrop without clicking success OK or waiting on an outer wrapper`, async (t) => {
    const page = await fixture(t, mode);
    const calls = monitorNavigations(page);
    const result = await submitBooking(page, { cleanupTimeoutMs: 1_500 });
    assert.equal(result.outcome, 'confirmed');
    assert.equal(await page.evaluate(() => window.successOkClicks), 0);
    assert.equal(await page.evaluate(() => window.backdropClicks), mode === 'swal-container-ignore-first' ? 2 : 1);
    assert.equal(calls.submissions, 1);
    assert.deepEqual(calls.navigations, []);
  });
}

test('confirmed booking keeps waiting beyond five seconds and then continues without skipping', { timeout: 10_000 }, async (t) => {
  const page = await fixture(t, 'cleanup-failure');
  const calls = monitorNavigations(page);
  const control = {};
  const attempted = [];
  let releaseNotice;
  const notice = new Promise((resolve) => { releaseNotice = resolve; });
  const originalLog = console.log;
  t.mock.method(console, 'log', (...args) => {
    if (String(args[0]).includes('Still waiting for its success popup')) releaseNotice();
    else originalLog(...args);
  });
  const requests = [1, 2].map((day) => ({ label: `booking-${day}`, date: `2026-10-0${day}`, from: '10:00', to: '12:00' }));
  const run = runBookingQueue({
    requests, pages: [page], control, stopOnFailure: false,
    attempt: async (page, request) => {
      attempted.push(request.label);
      if (request.label === 'booking-1') await submitBooking(page);
      return { success: true, outcome: 'confirmed', request };
    },
  });
  await notice;
  assert.deepEqual(attempted, ['booking-1']);
  assert.equal(Boolean(control.stopped), false);
  await page.evaluate(() => document.querySelector('.swal2-popup').remove());
  const results = await run;
  assert.equal(results.every((result) => result.success), true);
  assert.deepEqual(attempted, ['booking-1', 'booking-2']);
  assert.equal(calls.submissions, 1);
  assert.deepEqual(calls.navigations, []);
});

for (const mode of ['stale', 'disappeared', 'unrelated', 'generic', 'already-created']) {
  test(`${mode} feedback is not proof of success and never causes resubmission`, async (t) => {
    const page = await fixture(t, mode);
    await assert.rejects(submitBooking(page, { timeoutMs: 250 }), (error) =>
      error instanceof BookingSubmissionError && error.outcome === 'unknown' && error.stopQueue
    );
    assert.equal(await page.evaluate(() => window.counts.submit), 1);
    assert.equal(await page.evaluate(() => window.__liveMuseekSubmission), undefined);
  });
}

for (const mode of ['rejected', 'event-rejected', 'event-rejected-confirmation']) {
  test(`${mode} is dismissed with OK and returned as a definite rejection`, async (t) => {
    const page = await fixture(t, mode);
    const result = await submitBooking(page, { timeoutMs: 700 });
    assert.equal(result.success, false);
    assert.equal(result.outcome, 'rejected');
    assert.equal(await page.evaluate(() => window.rejectionOkClicks), 1);
    assert.equal(await page.$('.swal2-popup'), null);
    assert.equal(await page.evaluate(() => window.counts.submit), 1);
  });
}

test('rejection whose popup cannot be dismissed still stops the queue', async (t) => {
  const page = await fixture(t, 'rejection-stuck');
  await assert.rejects(submitBooking(page, { cleanupTimeoutMs: 150 }), (error) =>
    error.outcome === 'rejected' && error.stopQueue && /could not be cleared/.test(error.message)
  );
  assert.equal(await page.evaluate(() => window.rejectionOkClicks), 1);
  assert.equal(await page.evaluate(() => window.counts.submit), 1);
});

test('event rejection popup is cleared before another priority location submits', async (t) => {
  const page = await fixture(t, 'event-rejected');
  const locations = [];
  const control = {};
  const result = await attemptPriorityBooking(page, {
    label: 'fixture booking', date: '2026-10-15', from: '10:00', to: '12:00',
    locationPriority: [{ name: 'first' }, { name: 'second' }],
  }, {
    control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
    book: async (page, location) => {
      locations.push(location.name);
      if (location.name === 'second') {
        assert.equal(await page.$('.swal2-popup'), null);
        await page.evaluate(() => { document.querySelector('#submit').onclick = window.succeed; });
      }
      return submitBooking(page);
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.location.name, 'second');
  assert.deepEqual(locations, ['first', 'second']);
  assert.equal(Boolean(control.stopped), false);
});

test('popup cleanup failure preserves positive confirmation', async (t) => {
  const page = await fixture(t, 'cleanup-failure');
  await assert.rejects(submitBooking(page, { cleanupTimeoutMs: 150 }), (error) =>
    error.outcome === 'confirmed' && error.stopQueue
  );
});

function monitorNavigations(page) {
  const calls = { submissions: 0, navigations: [] };
  page.on('console', (message) => { if (message.text() === 'fixture-submit') calls.submissions += 1; });
  page.on('request', (request) => {
    if (request.isNavigationRequest()) calls.navigations.push(request.url());
  });
  return calls;
}

for (const mode of ['form-remains', 'event-rejected']) {
  test(`${mode}: dismisses feedback and preserves the form without navigation`, async (t) => {
    const page = await fixture(t, mode);
    const calls = monitorNavigations(page);
    const result = await submitBooking(page, { cleanupTimeoutMs: 150 });
    assert.equal(result.outcome, mode === 'form-remains' ? 'confirmed' : 'rejected');
    assert.notEqual(await page.$('#booking'), null);
    assert.equal(await page.$('.swal2-popup'), null);
    assert.equal(calls.submissions, 1);
    assert.deepEqual(calls.navigations, []);
  });
}

test('undismissable confirmed feedback stops without navigating or resubmitting', async (t) => {
  const page = await fixture(t, 'cleanup-failure');
  const calls = monitorNavigations(page);
  await assert.rejects(submitBooking(page, { cleanupTimeoutMs: 150 }),
    (error) => error.outcome === 'confirmed' && error.stopQueue);
  assert.equal(calls.submissions, 1);
  assert.deepEqual(calls.navigations, []);
});

test('unknown outcome does not navigate away or attempt recovery', async (t) => {
  const page = await fixture(t, 'stale');
  const calls = monitorNavigations(page);
  await assert.rejects(submitBooking(page, { timeoutMs: 150 }),
    (error) => error.outcome === 'unknown' && error.stopQueue);
  assert.equal(calls.submissions, 1);
  assert.equal(calls.navigations.length, 0);
});

test('queue books two requests on the same form without navigation', async (t) => {
  const page = await fixture(t, 'form-remains');
  const calls = monitorNavigations(page);
  const control = {};
  const attempts = [];
  const requests = [1, 2].map((day) => ({
    label: `booking-${day}`, date: `2026-10-0${day}`, from: '10:00', to: '12:00',
    locationPriority: [{ name: 'first' }, { name: 'second' }],
  }));
  const results = await runBookingQueue({
    requests, pages: [page], control, stopOnFailure: false,
    attempt: (page, request) => attemptPriorityBooking(page, request, {
      control, limit: createLimiter(2), resolve: async (entry) => entry, precheck: async () => {},
      book: async (page, location, request) => {
        attempts.push([request.label, location.name]);
        return submitBooking(page, { cleanupTimeoutMs: 150 });
      },
    }),
  });
  assert.deepEqual(attempts, [['booking-1', 'first'], ['booking-2', 'first']]);
  assert.equal(results.every((result) => result.success), true);
  assert.equal(Boolean(control.stopped), false);
  assert.equal(calls.submissions, 2);
  assert.deepEqual(calls.navigations, []);
});

test('a stop arriving while the observer is armed prevents Submit', async (t) => {
  const page = await fixture(t, 'immediate');
  await assert.rejects(submitBooking(page, { isStopped: () => true }), (error) => error.outcome === 'not-submitted');
  assert.equal(await page.evaluate(() => window.counts.submit), 0);
});

test('a stop after Submit prevents the confirmation click', async (t) => {
  const page = await fixture(t, 'stop-before-confirmation');
  let checks = 0;
  await assert.rejects(submitBooking(page, { isStopped: () => ++checks > 1 }), (error) => error.outcome === 'unknown');
  assert.deepEqual(await page.evaluate(() => window.counts), { submit: 1, confirm: 0 });
});

test('two concurrent tabs keep confirmation and outcome evidence separate', async (t) => {
  const [first, second] = await Promise.all([fixture(t, 'confirmation'), fixture(t, 'stale')]);
  const results = await Promise.allSettled([
    submitBooking(first, { timeoutMs: 1_000 }), submitBooking(second, { timeoutMs: 300 }),
  ]);
  assert.equal(results[0].value.outcome, 'confirmed');
  assert.equal(results[1].reason.outcome, 'unknown');
});

test('date selection completes without animation frames while waiting for delayed UI updates', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent('<div id="date">2026-11-01</div>');
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const date = document.querySelector('#date');
    window.__liveMuseekNacHelpers = {
      getBookingSnapshot: () => ({ dateKey: date.textContent, dateValue: date.textContent }),
      openDatePicker: () => {
        setTimeout(() => {
          const picker = document.createElement('div');
          picker.id = 'calendar';
          picker.textContent = 'November 2026';
          document.body.append(picker);
        }, 80);
        return true;
      },
      findDatePickerRoot: () => document.querySelector('#calendar'),
      getDatePickerMonthContextData: () => ({ year: 2026, monthIndex: 10 }),
      getDatePickerCandidates: () => [{ dateKey: '2026-11-02', index: 0 }],
      inspectDatePickerDateKey: () => ({ exists: true, selectable: true }),
      clickDatePickerDateKey: () => {
        if (!document.querySelector('#calendar')) throw new Error('Picker is not ready');
        setTimeout(() => { date.textContent = '2026-11-02'; }, 80);
        return { exists: true, clicked: true };
      },
    };
  });
  assert.equal((await selectBookingDate(page, '2026-11-02')).dateKey, '2026-11-02');
});

test('location selection waits for the selected value to render', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent('<div id="location">Old location</div>');
  await page.evaluate(() => {
    const location = document.querySelector('#location');
    window.__liveMuseekNacHelpers = {
      setLocationSelection: (_id, name) => {
        setTimeout(() => { location.textContent = name; }, 80);
        return { ok: true };
      },
      getBookingSnapshot: () => ({ locationText: location.textContent }),
    };
  });
  const result = await setBookingLocation(page, { locationId: 'new', locationName: 'New location' });
  assert.equal(result.locationText, 'New location');
});

test('startup reuses an authenticated page and waits for delayed booking controls without navigating', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  const navigations = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.url() === BUSKING_DETAILS_URL) {
      navigations.push(request.url());
      return request.respond({ status: 200, contentType: 'text/html', body: '<div>My bookings</div>' });
    }
    return request.abort();
  });
  await page.goto(BUSKING_DETAILS_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    setTimeout(() => {
      document.body.innerHTML = '<button>Submit Booking</button>';
      window.controlsRendered = true;
    }, 100);
  });
  const result = await ensureAuthenticatedBuskingDetailsPage({ pages: async () => [page] }, {
    headless: true, navigationTimeoutMs: 1_000,
  });
  assert.equal(result, page);
  assert.equal(await page.evaluate(() => window.controlsRendered), true);
  assert.deepEqual(navigations, [BUSKING_DETAILS_URL]);
});

test('manual login landing page is reused without navigating to details again', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  const navigations = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!request.isNavigationRequest()) return request.abort();
    navigations.push(request.url());
    if (request.url() === BUSKING_DETAILS_URL) {
      return request.respond({ status: 302, headers: { location: BEFORE_LOGIN_URL } });
    }
    if (request.url() === BEFORE_LOGIN_URL) {
      return request.respond({ status: 200, contentType: 'text/html', body: `
        <div>Complete Singpass login</div>
        <script>setTimeout(() => {
          history.replaceState({}, '', '/Busking/busker/details');
          document.body.innerHTML = '<button>Submit Booking</button>';
        }, 100);</script>` });
    }
    return request.abort();
  });
  const result = await ensureAuthenticatedBuskingDetailsPage({ pages: async () => [page] }, {
    headless: false, navigationTimeoutMs: 1_000, manualLoginTimeoutMs: 3_000, userDataDir: 'disposable-test-profile',
  });
  assert.equal(result, page);
  assert.deepEqual(navigations, [BUSKING_DETAILS_URL, BEFORE_LOGIN_URL]);
});

test('a reused details URL without booking controls fails readiness without reloading', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  let navigations = 0;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.isNavigationRequest()) {
      navigations += 1;
      return request.respond({ status: 200, contentType: 'text/html', body: '<button disabled>Submit Booking</button>' });
    }
    return request.abort();
  });
  await page.goto(BUSKING_DETAILS_URL, { waitUntil: 'domcontentloaded' });
  await assert.rejects(ensureAuthenticatedBuskingDetailsPage({ pages: async () => [page] }, {
    headless: true, navigationTimeoutMs: 150,
  }), /Waiting failed/);
  assert.equal(navigations, 1);
});

test('reused form selects only the next time range and clears old checked slots', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent(`<div role="dialog"><h2>Create a booking</h2><table>
    <tr><td>1</td><td>10:00</td><td>11:00</td><td><input type="checkbox" checked></td></tr>
    <tr><td>2</td><td>11:00</td><td>12:00</td><td><input type="checkbox" checked></td></tr>
    <tr><td>3</td><td>18:00</td><td>19:00</td><td><input type="checkbox"></td></tr>
    <tr><td>4</td><td>19:00</td><td>20:00</td><td><input type="checkbox"></td></tr>
    </table></div>`);
  await installNacPageHelpers(page);
  await selectBookingTimeRange(page, '18:00', '20:00');
  assert.deepEqual(await page.$$eval('input', (inputs) => inputs.map((input) => input.checked)), [false, false, true, true]);
  await page.$eval('input', (input) => { input.checked = true; input.disabled = true; });
  await assert.rejects(selectBookingTimeRange(page, '18:00', '20:00'), /unexpected=10:00-11:00/);
});
