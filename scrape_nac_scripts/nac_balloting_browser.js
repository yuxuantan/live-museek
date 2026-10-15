import {
  clickBookingModalButton,
  clickVisibleElementByText,
  getBookingSnapshot,
  installNacPageHelpers,
  selectBookingTimeRange,
  submitBooking,
  waitForBookingModal,
} from './nac_booking_browser.js';
import { expandTimeRangeToSlotKeys, normalizeTimeLabel, toDateKey } from './nac_common.js';

export async function openBallotingModal(page) {
  await installNacPageHelpers(page, { mode: 'balloting' });
  const initial = await getBookingSnapshot(page);
  if (!initial?.found) {
    await clickVisibleElementByText(page, 'Submit Balloting');
    await waitForBookingModal(page);
  }
  return { ...await getBookingSnapshot(page), reused: Boolean(initial?.found) };
}

export async function waitForBallotingDates(page, timeoutMs = 15_000) {
  // NAC loads allowed dates asynchronously on modal open and location change.
  // Its jQuery completion handler resets the selected date; let it finish first.
  await page.waitForFunction(() => !window.jQuery || window.jQuery.active === 0,
    { timeout: timeoutMs, polling: 100 });
}

export async function selectBallotingSlot(page, from, to) {
  if (expandTimeRangeToSlotKeys(from, to).length !== 1) {
    throw new Error('Balloting requires exactly one timeslot per submission.');
  }
  const result = await selectBookingTimeRange(page, from, to);
  const selectedKeys = await page.evaluate(() => {
    const helpers = window.__liveMuseekNacHelpers;
    return [...helpers.findBookingRoot().querySelectorAll('tr')]
      .filter((row) => row.querySelector('input[type="radio"]')?.checked)
      .map((row) => {
        const cells = [...row.querySelectorAll('th, td')].map((cell) => helpers.getText(cell));
        return helpers.buildTimeSlotKey(cells[1], cells[2]);
      });
  });
  if (selectedKeys.length !== 1 || selectedKeys[0] !== expandTimeRangeToSlotKeys(from, to)[0]) {
    throw new Error('Balloting form did not retain exactly the requested radio selection.');
  }
  return result;
}

export async function loadBallotingSlots(page, from, to, { timeoutMs = 15_000 } = {}) {
  const keys = expandTimeRangeToSlotKeys(from, to);
  await page.evaluate(() => {
    const root = window.__liveMuseekNacHelpers.findBookingRoot();
    if (!root) throw new Error('Balloting form is missing.');
    const state = { changed: false };
    state.observer = new MutationObserver((records) => {
      if (records.some((record) => record.target.closest?.('table') ||
        [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1 &&
          (node.matches('table, tbody, tr') || node.querySelector('table, tr'))))) state.changed = true;
    });
    state.observer.observe(root, { childList: true, subtree: true, characterData: true });
    window.__liveMuseekBallotingLoad = state;
  });
  try {
    await clickBookingModalButton(page, 'Load');
    await page.waitForFunction((keys) => {
      const rows = window.__liveMuseekNacHelpers.extractSlotRows();
      return window.__liveMuseekBallotingLoad?.changed && keys.every((key) => rows.some((row) => row.key === key));
    }, { timeout: timeoutMs, polling: 100 }, keys);
  } finally {
    await page.evaluate(() => {
      window.__liveMuseekBallotingLoad?.observer.disconnect();
      delete window.__liveMuseekBallotingLoad;
    }).catch(() => {});
  }
}

// Submission feedback is separate from the one history check at the end of the run.
export function observeBallotingSubmission() {
  window.__liveMuseekSubmission?.observer?.disconnect();
  const helpers = window.__liveMuseekNacHelpers;
  const selector = '[role="dialog"], dialog, .swal2-popup, .sweet-alert, .modal, .ui-dialog, [role="alert"], [role="status"], .alert';
  const visible = (element) => {
    if (!element?.isConnected || !helpers.isVisible(element)) return false;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    }
    return true;
  };
  const readText = (element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (parent && visible(parent) && !parent.closest('button, input, [role="button"]')) parts.push(walker.currentNode.textContent);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  };
  const baseline = new WeakMap();
  document.querySelectorAll(selector).forEach((element) => {
    if (visible(element)) baseline.set(element, readText(element));
  });
  const state = { outcome: null, confirmationHandled: false, element: null, text: '', isVisible: visible };
  state.scan = () => {
    if (['success', 'rejected'].includes(state.outcome)) return;
    const root = helpers.findBookingRoot();
    for (const element of [...document.querySelectorAll(selector)].reverse()) {
      if (!visible(element) || element === root || element.contains(root)) continue;
      const text = readText(element);
      if (!text || baseline.get(element) === text) continue;
      const negative = /\b(fail(?:ed|ure)?|unsuccessful|unable|cannot|can't|could not|not|error|rejected|unavailable|already|exceeded)\b/i.test(text);
      const success = !negative && (
        /\b(?:balloting|ballot)(?: (?:application|submission))? (?:has been |was |is )?(?:(?:created|submitted|received) successfully|successfully (?:created|submitted|received)|successful)\b/i.test(text) ||
        /\bsuccessfully (?:created|submitted|received) (?:your |the |a )?(?:balloting|ballot)\b/i.test(text));
      const rejected = /\b(?:balloting|ballot|event)(?: (?:creation|submission|application))? (?:has been |was |is )?(?:not successful|unsuccessful|failed|rejected)\b/i.test(text) ||
        /\b(?:unable|failed|could not) to (?:create|submit) (?:your |the |a )?(?:balloting|ballot|event)\b/i.test(text);
      const confirmation = /are you sure/i.test(text) && /\b(?:create|submit) (?:a |your |the )?(?:balloting|ballot)\b/i.test(text);
      if (success || rejected || (confirmation && !state.confirmationHandled)) {
        Object.assign(state, { outcome: success ? 'success' : rejected ? 'rejected' : 'confirmation', element, text });
        if (success || rejected) return;
      }
    }
  };
  state.observer = new MutationObserver(state.scan);
  state.observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  window.__liveMuseekSubmission = state;
}

export async function submitBalloting(page, expected, options = {}) {
  const date = toDateKey(expected.date);
  const from = normalizeTimeLabel(expected.from);
  const to = normalizeTimeLabel(expected.to);
  if (!date || !expected.locationName || expandTimeRangeToSlotKeys(from, to).length !== 1) {
    throw new Error('Balloting submission requires location, date and exactly one timeslot.');
  }
  try {
    const result = await submitBooking(page, {
      ...options, observeFeedback: observeBallotingSubmission, activityName: 'Balloting',
      successDismissal: 'backdrop', allowSuccessButtonFallback: false,
    });
    return { ...result, pendingVerified: false };
  } catch (error) {
    error.message = error.message.replace(/booking/gi, 'balloting');
    throw error;
  }
}

export async function loadAllBallotingHistory(page, { timeoutMs = 15_000 } = {}) {
  await installNacPageHelpers(page, { mode: 'balloting' });
  await page.waitForFunction(() => document.querySelector('#div-bookinglist') &&
    (!window.jQuery || window.jQuery.active === 0), { timeout: timeoutMs, polling: 100 });
  await page.evaluate(() => {
    const helpers = window.__liveMuseekNacHelpers;
    window.__liveMuseekBallotingHistory = {
      more() {
        return [...document.querySelectorAll('button, a, input[type="button"]')].find((button) =>
          helpers.isVisible(button) && !helpers.findBookingRoot()?.contains(button) &&
          /^load more$/i.test(helpers.getText(button)));
      },
    };
  });
  let pagesLoaded = 1;
  try {
    while (true) {
      await page.waitForFunction(() => {
        const more = window.__liveMuseekBallotingHistory.more();
        return (!window.jQuery || window.jQuery.active === 0) &&
          (!more || (!more.disabled && more.getAttribute('aria-disabled') !== 'true'));
      }, { timeout: timeoutMs, polling: 100 });
      const clicked = await page.evaluate(() => {
        const state = window.__liveMuseekBallotingHistory;
        const history = document.querySelector('#div-bookinglist');
        if (!history) throw new Error('Balloting history disappeared.');
        if (/something went wrong|system error/i.test(history.innerText)) throw new Error('NAC could not load balloting history.');
        const more = state.more();
        if (!more) return false;
        state.beforeLinks = history.querySelectorAll('a').length;
        more.click();
        state.ajaxObserved = Boolean(window.jQuery && window.jQuery.active > 0);
        return true;
      });
      if (!clicked) return { pagesLoaded, complete: true };
      await page.waitForFunction(() => {
        const state = window.__liveMuseekBallotingHistory;
        if (!state) throw new Error('Balloting history page was lost.');
        const history = document.querySelector('#div-bookinglist');
        if (!history) throw new Error('Balloting history disappeared.');
        if (/something went wrong|system error/i.test(history.innerText)) throw new Error('NAC could not load balloting history.');
        return (!window.jQuery || window.jQuery.active === 0) &&
          (history.querySelectorAll('a').length > state.beforeLinks || (state.ajaxObserved && !state.more()));
      }, { timeout: timeoutMs, polling: 100 });
      pagesLoaded++;
    }
  } finally {
    await page.evaluate(() => { delete window.__liveMuseekBallotingHistory; }).catch(() => {});
  }
}

// Called once, after Load More is exhausted. Compare each requested slot within ONE tile.
export async function readBallotingHistory(page, expected) {
  return page.evaluate((expected) => {
    const helpers = window.__liveMuseekNacHelpers;
    const history = document.querySelector('#div-bookinglist');
    if (!history) throw new Error('Balloting history is missing.');
    const text = (element) => String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
    const visible = (element) => {
      if (!element?.isConnected || !helpers.isVisible(element)) return false;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      return true;
    };
    const statusPattern = /^(PENDING|REJECTED|PUBLISHED|APPROVED|CANCELLED|CONFIRMED)$/i;
    const statuses = [...history.querySelectorAll('div, span, p, strong, label, h4, h5')]
      .filter((element) => visible(element) && statusPattern.test(text(element)))
      .filter((element) => ![...element.children].some((child) => statusPattern.test(text(child))));
    const timePattern = /(\d{1,2}:\d{2})(?::?\s*(AM|PM)\b)?\s*[-–—]\s*(\d{1,2}:\d{2})(?::?\s*(AM|PM)\b)?/i;
    const normalizeTime = (value, meridiem) => {
      let [hours, minutes] = value.split(':').map(Number);
      if (meridiem) hours = hours % 12 + (meridiem.toUpperCase() === 'PM' ? 12 : 0);
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };
    return expected.map((request) => {
      const date = new Date(`${request.date}T00:00:00Z`);
      const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date);
      const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(date);
      const datePattern = new RegExp(`\\b${weekday},?\\s+0?${date.getUTCDate()}\\s+${month}(?:\\s+(20\\d{2}))?\\b`, 'i');
      const matches = [];
      for (const status of statuses) {
        for (let tile = status.parentElement; tile && history.contains(tile); tile = tile.parentElement) {
          if (statuses.filter((element) => tile.contains(element)).length !== 1) break;
          const content = text(tile);
          const dateMatch = content.match(datePattern);
          const time = content.match(timePattern);
          const locationMatches = [...tile.querySelectorAll('a')].some((link) =>
            helpers.normalizeLocationKey(text(link)) === helpers.normalizeLocationKey(request.locationName));
          if (locationMatches && dateMatch && (!dateMatch[1] || Number(dateMatch[1]) === date.getUTCFullYear()) && time &&
            normalizeTime(time[1], time[2]) === request.from && normalizeTime(time[3], time[4]) === request.to) {
            matches.push(text(status).toUpperCase());
            break;
          }
        }
      }
      return { ...request, status: matches.includes('PENDING') ? 'PENDING' : matches[0] ?? null, pendingVerified: matches.includes('PENDING') };
    });
  }, expected);
}
