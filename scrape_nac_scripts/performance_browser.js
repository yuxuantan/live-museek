const BASE_URL = 'https://eservices.nac.gov.sg/Busking';
const MORE = '#div-load-booking-grid-more';
const GRID = '#div-booking-result-view';

export const DEFAULT_LIMITS = {
  navigationAttempts: 3,
  navigationTimeoutMs: 60_000,
  readyTimeoutMs: 15_000,
  responseTimeoutMs: 30_000,
  retryDelayMs: 1_000,
  locationTimeoutMs: 300_000,
  maxPages: 250,
  maxEvents: 10_000,
};

function remaining(deadline, timeout) {
  const available = deadline - Date.now();
  if (available <= 0) throw new Error('Location scrape deadline exceeded');
  return Math.min(available, timeout);
}

// These functions run inside Chromium. Return only small event fields, never page HTML.
function pageReady(kind, locationId) {
  if (kind === 'directory') {
    return [...document.querySelectorAll('#Location option')].some((option) =>
      option.value && option.value !== '00000000-0000-0000-0000-000000000000');
  }
  if (document.querySelector('#locationId')?.value !== locationId) return false;
  return Boolean(document.querySelector('#div-booking-result-view a[href*="/profile/"]')) ||
    /No Records found/i.test(document.body.innerText);
}

export async function navigateReady(page, url, kind, locationId, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const deadline = options.deadline ?? Date.now() + limits.locationTimeoutMs;
  let lastError;
  for (let attempt = 1; attempt <= limits.navigationAttempts; attempt++) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: remaining(deadline, limits.navigationTimeoutMs),
      });
      if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
      if (new URL(page.url()).pathname !== new URL(url).pathname) {
        throw new Error(`Unexpected navigation to ${page.url()}`);
      }
      const ready = await page.waitForFunction(pageReady, {
        timeout: remaining(deadline, limits.readyTimeoutMs),
      }, kind, locationId);
      await ready.dispose();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Navigation attempt ${attempt}/${limits.navigationAttempts} failed for ${url}: ${error.message}`);
      if (attempt < limits.navigationAttempts) {
        await new Promise((resolve) => setTimeout(resolve, remaining(deadline, limits.retryDelayMs * attempt)));
      }
    }
  }
  throw new Error(`Failed to load validated ${kind} page: ${url}`, { cause: lastError });
}

export async function createEventPage(browser) {
  const page = await browser.newPage();
  try {
    // Event text and pagination do not require media. Keep scripts and CSS for the UI.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const action = ['image', 'media', 'font'].includes(request.resourceType())
        ? request.abort() : request.continue();
      action.catch(() => {}); // A tab can close while a request is being handled.
    });
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

export async function readLocations(page, options = {}) {
  await navigateReady(page, `${BASE_URL}/`, 'directory', null, options);
  const locations = await page.$$eval('#Location option', (elements) => elements
    .map((element) => ({ location_id: element.value, location_name: element.textContent.trim() }))
    .filter((entry) => entry.location_id && entry.location_id !== '00000000-0000-0000-0000-000000000000'));
  if (!locations.length || locations.some((entry) => !entry.location_name ||
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(entry.location_id))) {
    throw new Error('Invalid or empty NAC location directory');
  }
  return [...new Map(locations.map((entry) => [entry.location_id, entry])).values()];
}

async function readEventState(page, maxEvents) {
  return page.evaluate((gridSelector, moreSelector, limit) => {
    const grid = document.querySelector(gridSelector);
    const cards = grid?.querySelectorAll('.col-cuttor');
    const elements = cards?.length ? [...cards] : [...(grid?.querySelectorAll('h3 a[href*="/profile/"]') ?? [])]
      .map((link) => link.closest('.dash-bx') ?? link.closest('div'));
    if (elements.length > limit) throw new Error(`Event limit exceeded: ${elements.length}`);
    const rows = elements.map((element) => {
      const times = element.querySelector('.dash-bx-times')?.children;
      const row = {
        href: element.querySelector('a[href*="/profile/"]')?.getAttribute('href') ?? '',
        date: times?.[0]?.textContent.trim() ?? '',
        time: times?.[1]?.textContent.trim() ?? '',
      };
      if (Object.values(row).some((value) => value.length > 512)) throw new Error('Oversized event field');
      return row;
    });
    const button = document.querySelector(moreSelector);
    const visible = Boolean(button?.getClientRects().length) &&
      getComputedStyle(button).visibility !== 'hidden';
    return {
      rows,
      empty: /No Records found/i.test(document.body.innerText),
      more: visible,
      disabled: Boolean(button?.disabled),
      skip: document.querySelector('#skip')?.value,
      take: document.querySelector('#take')?.value,
    };
  }, GRID, MORE, maxEvents);
}

function rowKey(row) {
  return JSON.stringify([row.href, row.date, row.time]);
}

export async function readLocationEvents(page, locationId, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const deadline = Date.now() + limits.locationTimeoutMs;
  const url = `${BASE_URL}/locations/${locationId}/events`;
  await navigateReady(page, url, 'events', locationId, { ...limits, deadline });
  let state = await readEventState(page, limits.maxEvents);
  if (!state.rows.length && (!state.empty || state.more)) throw new Error('Unrecognized empty events page');
  let unique = new Map(state.rows.map((row) => [rowKey(row), row]));
  let pages = 0;
  while (state.more) {
    if (pages >= limits.maxPages) throw new Error(`Pagination limit exceeded for ${locationId}`);
    if (state.disabled || !/^\d+$/.test(state.skip ?? '') || !/^[1-9]\d*$/.test(state.take ?? '')) {
      throw new Error(`Invalid pagination state for ${locationId}`);
    }
    const previous = state;
    const controller = new AbortController();
    try {
      // Arm before clicking. Matching skip/take prevents unrelated responses satisfying the wait.
      const responsePromise = page.waitForResponse((response) => {
        const responseUrl = new URL(response.url());
        return responseUrl.origin === new URL(url).origin &&
          responseUrl.pathname === `${new URL(url).pathname}/more` &&
          responseUrl.searchParams.get('skip') === previous.skip &&
          responseUrl.searchParams.get('take') === previous.take;
      }, { timeout: remaining(deadline, limits.responseTimeoutMs), signal: controller.signal });
      const [response] = await Promise.all([responsePromise, page.click(MORE)]);
      if (!response.ok()) throw new Error(`Pagination HTTP ${response.status()}`);
      const rendered = await page.waitForFunction((skip, selector) => {
        const button = document.querySelector(selector);
        return document.querySelector('#skip')?.value !== skip && button && !button.disabled;
      }, { timeout: remaining(deadline, limits.readyTimeoutMs) }, previous.skip, MORE);
      await rendered.dispose();
    } finally {
      controller.abort();
    }
    state = await readEventState(page, limits.maxEvents);
    if (Number(state.skip) <= Number(previous.skip)) throw new Error('Pagination cursor did not advance');
    const next = new Map(state.rows.map((row) => [rowKey(row), row]));
    if ([...unique.keys()].some((key) => !next.has(key))) throw new Error('Pagination lost previously loaded events');
    if (next.size === unique.size && (state.more || state.rows.length !== previous.rows.length)) {
      throw new Error('Pagination repeated events or made no progress');
    }
    unique = next;
    pages++;
    console.log(`Location ${locationId}: page=${pages}, events=${unique.size}, heapMB=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}`);
    remaining(deadline, 1);
  }
  return [...unique.values()];
}

export function parsePerformances(rows, locationId, year = new Date().getFullYear()) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return rows.map((row) => {
    const buskerId = row.href.match(/\/profile\/([^/?#]+)/)?.[1];
    const times = row.time.replace(/[–—]/g, '-').replace(/\s*-\s*/g, '-').split('-');
    const date = row.date.match(/^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*)?(\d{1,2})\s+([A-Za-z]+)$/);
    const day = Number(date?.[1]);
    const month = months.indexOf(date?.[2]);
    const parseTime = (text) => {
      const match = text?.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d):?(AM|PM)$/i);
      if (!match || month < 0 || day < 1) return null;
      const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
      // Preserve the scraper's existing local-time/current-year interpretation.
      const result = new Date(year, month, day, hour, Number(match[2]));
      return result.getMonth() === month && result.getDate() === day ? result : null;
    };
    const start = parseTime(times[0]);
    const end = parseTime(times[1]);
    if (!buskerId || times.length !== 2 || !start || !end || end <= start) {
      throw new Error(`Invalid event at location ${locationId}: ${JSON.stringify(row)}`);
    }
    return { busker_id: buskerId, location_id: locationId, start_datetime: start, end_datetime: end };
  });
}
