const BASE_URL = 'https://eservices.nac.gov.sg/Busking';
const MORE = '#div-load-booking-grid-more';
const GRID = '#div-booking-result-view';

export const DEFAULT_LIMITS = {
  navigationAttempts: 3,
  navigationTimeoutMs: 60_000,
  readyTimeoutMs: 15_000,
  responseTimeoutMs: 30_000,
  downloadTimeoutMs: 60_000,
  locationAttempts: 3,
  batchAttempts: 3,
  maxBatchBytes: 2 * 1024 * 1024,
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

export async function createEventPage(browser, label = 'directory') {
  const page = await browser.newPage();
  try {
    const blocked = new WeakSet();
    page.on('pageerror', (error) => {
      console.warn(`NAC page error [${label}] ${page.url()}: ${error.message}`);
    });
    page.on('requestfailed', (request) => {
      // Controlled pagination fetches report their own completed-body outcome below.
      // Chromium can also emit ERR_ABORTED after a usable body has been consumed.
      const url = new URL(request.url());
      if (request.resourceType?.() === 'fetch' && url.origin === new URL(BASE_URL).origin &&
        /\/events\/more$/.test(url.pathname)) return;
      if (!blocked.has(request)) {
        console.warn(`NAC request failed [${label}] ${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`);
      }
    });
    // Event text and pagination do not require media. Keep scripts and CSS for the UI.
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'media', 'font'].includes(request.resourceType())) blocked.add(request);
      const action = blocked.has(request)
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

// Read the same endpoint as NAC's Load more button, but own the abort controller.
// Only a completely downloaded and parsed batch can advance the caller's cursor.
export async function fetchEventBatch(page, url, cursor, options = {}, deadline = Infinity) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const batchUrl = new URL(`${url}/more`);
  batchUrl.searchParams.set('skip', cursor.skip);
  batchUrl.searchParams.set('take', cursor.take);
  let lastError;
  let attempts = 0;
  for (let attempt = 1; attempt <= limits.batchAttempts; attempt++) {
    if (Date.now() >= deadline) break;
    attempts = attempt;
    try {
      const result = await page.evaluate(async (requestUrl, config) => {
        const controller = new AbortController();
        const started = Date.now();
        let timer;
        let phase = 'response';
        let bytes = 0;
        let status = null;
        let timedOut = false;
        let downloaded = false;
        const arm = (nextPhase, timeout) => {
          phase = nextPhase;
          clearTimeout(timer);
          const duration = Math.min(timeout, config.budgetMs - (Date.now() - started));
          timer = setTimeout(() => { timedOut = true; controller.abort(); }, Math.max(0, duration));
        };
        try {
          arm('response', config.responseTimeoutMs);
          const response = await fetch(requestUrl, {
            signal: controller.signal, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
            // NAC embeds base64 photos for X-Requested-With: XMLHttpRequest.
            // A normal GET returns the same events with small image URLs instead.
            headers: { Accept: 'application/json' },
          });
          status = response.status;
          if (!response.ok) throw new Error(`HTTP ${status}`);
          arm('download', config.downloadTimeoutMs);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let text = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > config.maxBatchBytes) throw new Error('Batch byte limit exceeded');
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
          downloaded = true;
          clearTimeout(timer);
          phase = 'parse';
          // NAC serves a JSON-encoded HTML string (including "" at the end).
          const contentType = response.headers.get('content-type') ?? '';
          if (contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {
            throw new Error(`Unexpected pagination content type: ${contentType}`);
          }
          const html = JSON.parse(text);
          if (typeof html !== 'string') throw new Error('Expected an HTML string');
          if (!html.trim()) return { rows: [], terminal: true, bytes };
          // Template contents are inert: no images are fetched and scripts do not run.
          const template = document.createElement('template');
          template.innerHTML = html;
          const cards = [...template.content.querySelectorAll('.col-cuttor')];
          if (!cards.length || cards.length > config.take) throw new Error('Unrecognized pagination content');
          const rows = cards.map((card) => {
            const times = card.querySelector('.dash-bx-times')?.children;
            const row = {
              href: card.querySelector('a[href*="/profile/"]')?.getAttribute('href') ?? '',
              date: times?.[0]?.textContent.trim() ?? '',
              time: times?.[1]?.textContent.trim() ?? '',
            };
            if (Object.values(row).some((field) => !field || field.length > 512)) throw new Error('Invalid pagination event');
            return row;
          });
          return { rows, terminal: false, bytes };
        } catch (error) {
          return { error: `Pagination ${phase} ${timedOut ? 'timeout' : 'failed'}: ${error.message}`, status, bytes };
        } finally {
          clearTimeout(timer);
          // Abort and await the failed fetch before a retry can issue another request.
          if (!downloaded) controller.abort();
        }
      }, batchUrl.href, {
        responseTimeoutMs: limits.responseTimeoutMs, downloadTimeoutMs: limits.downloadTimeoutMs,
        maxBatchBytes: limits.maxBatchBytes, take: Number(cursor.take),
        budgetMs: Math.min(deadline - Date.now(), limits.responseTimeoutMs + limits.downloadTimeoutMs),
      });
      if (result.error) throw new Error(`${result.error}; status=${result.status ?? 'none'}, bytes=${result.bytes}`);
      return result;
    } catch (error) {
      lastError = error;
      console.warn(`Batch ${batchUrl.href} attempt ${attempt}/${limits.batchAttempts} failed: ${error.message}`);
      const delay = limits.retryDelayMs * attempt;
      if (attempt < limits.batchAttempts && Date.now() + delay < deadline) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else break;
    }
  }
  const error = new Error(`Pagination batch failed after ${attempts} attempts (${batchUrl.href}); ` +
    `location budget remaining=${Math.max(0, deadline - Date.now())}ms`, { cause: lastError });
  error.pagination = true;
  throw error;
}

export async function readLocationEventsWithRetries(browser, locationId, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  // All fresh-tab attempts share this deadline; retries cannot reset the budget.
  const deadline = Date.now() + limits.locationTimeoutMs;
  let lastError;
  let attempts = 0;
  for (let attempt = 1; attempt <= limits.locationAttempts; attempt++) {
    if (Date.now() >= deadline) break;
    attempts = attempt;
    let page;
    try {
      page = await createEventPage(browser, `${locationId}, attempt=${attempt}`);
      return await readLocationEvents(page, locationId, { ...limits, deadline });
    } catch (error) {
      lastError = error;
      console.warn(`Location ${locationId} attempt ${attempt}/${limits.locationAttempts} failed: ${error.message}`);
    } finally {
      await page?.close();
    }
    // Exhausted batch retries must not discard earlier batches and start over again.
    if (lastError?.pagination) break;
    const delay = limits.retryDelayMs * attempt;
    if (attempt < limits.locationAttempts && Date.now() + delay < deadline) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else break;
  }
  throw new Error(`Location ${locationId} failed after ${attempts} tab attempts; ` +
    `budget remaining=${Math.max(0, deadline - Date.now())}ms`, { cause: lastError });
}

export async function readLocationEvents(page, locationId, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const deadline = options.deadline ?? Date.now() + limits.locationTimeoutMs;
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
    const batch = await fetchEventBatch(page, url, state, limits, deadline);
    if (batch.terminal) break;
    const next = new Map(unique);
    for (const row of batch.rows) next.set(rowKey(row), row);
    if (next.size === unique.size) throw new Error('Pagination repeated events or made no progress');
    if (next.size > limits.maxEvents) throw new Error(`Event limit exceeded: ${next.size}`);
    unique = next;
    state = { ...state, skip: String(Number(state.skip) + Number(state.take)) };
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
