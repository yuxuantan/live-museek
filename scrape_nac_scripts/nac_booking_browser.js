import puppeteer from 'puppeteer';
import {
  BEFORE_LOGIN_URL,
  BUSKING_DETAILS_URL,
  DEFAULT_MANUAL_LOGIN_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DEFAULT_USER_DATA_DIR,
  LOGIN_BLOCK_PATTERNS,
  expandTimeRangeToSlotKeys,
  normalizeLocationLookupKey,
  normalizeText,
  sleep,
  toDateKey,
} from './nac_common.js';

export {
  DEFAULT_MANUAL_LOGIN_TIMEOUT_MS,
  DEFAULT_NAVIGATION_TIMEOUT_MS,
  DEFAULT_USER_DATA_DIR,
};

async function getPageText(page) {
  try {
    return await page.evaluate(() => document.body?.innerText ?? '');
  } catch (error) {
    return '';
  }
}

function isBeforeLoginUrl(url) {
  return String(url ?? '').toLowerCase().includes('/busking/beforelogin');
}

function isBuskerDetailsUrl(url) {
  return String(url ?? '').toLowerCase().includes('/busking/busker/details');
}

function isSingpassUrl(url) {
  return String(url ?? '').toLowerCase().includes('singpass');
}

function isBlockedLoginText(text) {
  return LOGIN_BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function buildBlockedLoginError(url) {
  return new Error(
    `NAC rejected the login attempt and asked you to wait before retrying. ` +
      `Close the browser, wait about 5 minutes, then rerun the script. Current URL: ${url}`
  );
}

async function detectPageSessionState(page) {
  const url = page.url();
  const text = await getPageText(page);
  const normalizedText = text.toLowerCase();

  if (isBlockedLoginText(normalizedText)) {
    return { state: 'blocked', url, page, text };
  }

  if (
    isBeforeLoginUrl(url) ||
    isSingpassUrl(url) ||
    normalizedText.includes('singpass') ||
    normalizedText.includes('log in')
  ) {
    return { state: 'needs_login', url, page, text };
  }

  if (isBuskerDetailsUrl(url)) {
    return { state: 'authenticated', url, page, text };
  }

  return { state: 'unknown', url, page, text };
}

function rankSessionState(state) {
  switch (state) {
    case 'blocked':
      return 0;
    case 'authenticated':
      return 1;
    case 'needs_login':
      return 2;
    default:
      return 3;
  }
}

async function detectBrowserSessionState(browser) {
  const pages = await browser.pages();
  if (pages.length === 0) {
    return null;
  }

  const states = [];
  for (const page of pages) {
    if (page.isClosed()) {
      continue;
    }
    states.push(await detectPageSessionState(page));
  }

  states.sort((left, right) => rankSessionState(left.state) - rankSessionState(right.state));
  return states[0] ?? null;
}

async function getOrCreatePage(browser) {
  const pages = await browser.pages();
  const existingPage = pages.find((page) => !page.isClosed());
  return existingPage ?? browser.newPage();
}

async function navigate(page, url, navigationTimeoutMs) {
  await page.goto(url, {
    timeout: navigationTimeoutMs,
    waitUntil: 'domcontentloaded',
  });
  return page;
}

export async function launchPersistentBrowser(args) {
  const launchOptions = {
    headless: args.headless,
    userDataDir: args.userDataDir,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
  };

  if (args.executablePath) {
    launchOptions.executablePath = args.executablePath;
  }

  return puppeteer.launch(launchOptions);
}

async function waitForAuthenticatedSession(browser, args) {
  const deadline = Date.now() + (args.manualLoginTimeoutMs ?? DEFAULT_MANUAL_LOGIN_TIMEOUT_MS);

  while (Date.now() < deadline) {
    const sessionState = await detectBrowserSessionState(browser);

    if (!sessionState) {
      await sleep(1000);
      continue;
    }

    if (sessionState.state === 'blocked') {
      throw buildBlockedLoginError(sessionState.url);
    }

    if (sessionState.state === 'authenticated') {
      return sessionState.page;
    }

    const isInteractiveLoginFlow =
      isBeforeLoginUrl(sessionState.url) ||
      isSingpassUrl(sessionState.url) ||
      sessionState.text.toLowerCase().includes('singpass');

    if (!isInteractiveLoginFlow && sessionState.page && !sessionState.page.isClosed()) {
      await navigate(sessionState.page, BUSKING_DETAILS_URL, args.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS);
      const retriedState = await detectPageSessionState(sessionState.page);
      if (retriedState.state === 'blocked') {
        throw buildBlockedLoginError(retriedState.url);
      }
      if (retriedState.state === 'authenticated') {
        return retriedState.page;
      }
    }

    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for manual Singpass login after ${Math.ceil((args.manualLoginTimeoutMs ?? DEFAULT_MANUAL_LOGIN_TIMEOUT_MS) / 1000)} seconds.`
  );
}

export async function ensureAuthenticatedBuskingDetailsPage(browser, args) {
  const page = await getOrCreatePage(browser);
  await page.bringToFront();
  await navigate(page, BUSKING_DETAILS_URL, args.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS);

  let sessionState = await detectBrowserSessionState(browser);
  if (sessionState?.state === 'blocked') {
    throw buildBlockedLoginError(sessionState.url);
  }

  if (sessionState?.state === 'authenticated') {
    return sessionState.page;
  }

  if (args.headless) {
    throw new Error(
      'No reusable NAC session was found in the saved browser profile. Rerun without --headless to complete Singpass login once.'
    );
  }

  const loginPage = sessionState?.page && !sessionState.page.isClosed() ? sessionState.page : page;
  await loginPage.bringToFront();
  await navigate(loginPage, BEFORE_LOGIN_URL, args.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS);

  console.log('No reusable NAC session found. Complete Singpass login in the opened browser window.');
  console.log(`The browser profile is persisted at: ${args.userDataDir}`);

  const authenticatedPage = await waitForAuthenticatedSession(browser, args);
  await authenticatedPage.bringToFront();
  await navigate(authenticatedPage, BUSKING_DETAILS_URL, args.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS);

  sessionState = await detectPageSessionState(authenticatedPage);
  if (sessionState.state === 'blocked') {
    throw buildBlockedLoginError(sessionState.url);
  }
  if (sessionState.state !== 'authenticated') {
    throw new Error(`Authenticated session did not resolve to the busker details page. Current URL: ${sessionState.url}`);
  }

  return authenticatedPage;
}

export async function waitForVisibleText(page, expectedText, timeout = 30_000) {
  await page.waitForFunction(
    (needle) => {
      const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const normalizedNeedle = normalize(needle);
      return [...document.querySelectorAll('body, body *')].some((element) => {
        const text = normalize(element.textContent || element.innerText || '');
        return isVisible(element) && text.includes(normalizedNeedle);
      });
    },
    { timeout },
    expectedText
  );
}

export async function clickVisibleElementByText(page, expectedText, timeout = 30_000) {
  await waitForVisibleText(page, expectedText, timeout);

  const clickResult = await page.evaluate((needle) => {
    const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    const isVisible = (element) => {
      if (!(element instanceof Element)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const readText = (element) => {
      if (element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type)) {
        return normalize(element.value);
      }

      return normalize(element.innerText || element.textContent || '');
    };

    const candidates = [
      ...document.querySelectorAll(
        'button, a, input[type="button"], input[type="submit"], [role="button"], [tabindex], .btn, .button'
      ),
    ]
      .filter((element) => isVisible(element))
      .map((element) => ({
        element,
        text: readText(element),
        area: (() => {
          const rect = element.getBoundingClientRect();
          return rect.width * rect.height;
        })(),
      }))
      .filter(({ text }) => text && (text === normalize(needle) || text.includes(normalize(needle))))
      .sort((left, right) => {
        const leftExact = left.text === normalize(needle) ? 0 : 1;
        const rightExact = right.text === normalize(needle) ? 0 : 1;
        if (leftExact !== rightExact) {
          return leftExact - rightExact;
        }

        if (left.text.length !== right.text.length) {
          return left.text.length - right.text.length;
        }

        return right.area - left.area;
      });

    const target = candidates[0]?.element ?? null;
    if (!target) {
      return null;
    }

    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    target.click();
    return {
      tagName: target.tagName,
      text: readText(target),
    };
  }, expectedText);

  if (!clickResult) {
    throw new Error(`Unable to find a visible element with text matching "${expectedText}".`);
  }
}

export async function installNacPageHelpers(page) {
  await page.evaluate(() => {
    if (window.__liveMuseekNacHelpers) {
      return;
    }

    const MONTH_INDEX_BY_NAME = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const helpers = {
      normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
      },

      normalizeLocationKey(value) {
        return helpers.normalizeText(value).toLowerCase().replace(/^\*+/, '').replace(/[^a-z0-9]+/g, '');
      },

      normalizeTimeLabel(value) {
        const match = helpers.normalizeText(value).match(/\b(\d{1,2}):(\d{2})\b/);
        if (!match) {
          return '';
        }
        return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`;
      },

      buildTimeSlotKey(from, to) {
        const normalizedFrom = helpers.normalizeTimeLabel(from);
        const normalizedTo = helpers.normalizeTimeLabel(to);
        if (!normalizedFrom || !normalizedTo) {
          return '';
        }
        return `${normalizedFrom}-${normalizedTo}`;
      },

      isVisible(element) {
        if (!(element instanceof Element)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },

      getArea(element) {
        const rect = element.getBoundingClientRect();
        return rect.width * rect.height;
      },

      getText(element) {
        if (!element) {
          return '';
        }

        if (element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type)) {
          return helpers.normalizeText(element.value);
        }

        return helpers.normalizeText(element.innerText || element.textContent || '');
      },

      readControlValue(element) {
        if (!element) {
          return '';
        }

        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        ) {
          const selectedOption = element instanceof HTMLSelectElement
            ? element.options[element.selectedIndex]?.text
            : '';
          return helpers.normalizeText(selectedOption || element.value || element.getAttribute('value') || '');
        }

        return helpers.normalizeText(
          element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('value') ||
            helpers.getText(element)
        );
      },

      createDateKey(year, monthIndex, day) {
        if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || !Number.isInteger(day)) {
          return '';
        }

        const date = new Date(year, monthIndex, day, 12, 0, 0, 0);
        if (
          Number.isNaN(date.getTime()) ||
          date.getFullYear() !== year ||
          date.getMonth() !== monthIndex ||
          date.getDate() !== day
        ) {
          return '';
        }

        return [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, '0'),
          String(date.getDate()).padStart(2, '0'),
        ].join('-');
      },

      parseDateKey(value) {
        const normalizedValue = helpers.normalizeText(value);
        if (!normalizedValue) {
          return '';
        }

        let match = normalizedValue.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
        if (match) {
          return helpers.createDateKey(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
        }

        match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
          return helpers.createDateKey(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }

        match = normalizedValue.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
        if (match) {
          const monthIndex = MONTH_INDEX_BY_NAME[match[1].toLowerCase()];
          return monthIndex == null ? '' : helpers.createDateKey(Number(match[3]), monthIndex, Number(match[2]));
        }

        match = normalizedValue.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
        if (match) {
          const monthIndex = MONTH_INDEX_BY_NAME[match[2].toLowerCase()];
          return monthIndex == null ? '' : helpers.createDateKey(Number(match[3]), monthIndex, Number(match[1]));
        }

        const parsed = new Date(normalizedValue);
        if (Number.isNaN(parsed.getTime())) {
          return '';
        }

        return helpers.createDateKey(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
      },

      findBookingRoot() {
        const candidates = [
          ...document.querySelectorAll(
            '[role="dialog"], dialog, .modal, .modal-dialog, .ui-dialog, .cdk-overlay-pane, .p-dialog, .swal2-popup, section, div'
          ),
        ]
          .filter((element) => helpers.isVisible(element))
          .filter((element) => helpers.getText(element).toLowerCase().includes('create a booking'))
          .sort((left, right) => helpers.getArea(right) - helpers.getArea(left));

        return candidates[0] ?? null;
      },

      isLikelyFieldControl(element, keyword) {
        if (!(element instanceof Element)) {
          return false;
        }

        if (element instanceof HTMLInputElement) {
          const type = String(element.type || 'text').toLowerCase();
          if (['hidden', 'button', 'submit', 'checkbox', 'radio'].includes(type)) {
            return false;
          }

          if (keyword === 'date') {
            return ['date', 'text', 'search', 'tel', 'number'].includes(type);
          }

          return true;
        }

        if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          return true;
        }

        const role = String(element.getAttribute('role') || '').toLowerCase();
        if (role === 'combobox' || role === 'textbox') {
          return true;
        }

        const className = String(element.className || '').toLowerCase();
        return /(select|dropdown|combobox|picker|textbox|input)/.test(className);
      },

      looksLikeDateControl(element) {
        if (!helpers.isLikelyFieldControl(element, 'date')) {
          return false;
        }

        const combinedText = [
          helpers.readControlValue(element),
          element.getAttribute?.('placeholder'),
          element.getAttribute?.('aria-label'),
          element.getAttribute?.('title'),
          element.getAttribute?.('name'),
          element.getAttribute?.('id'),
          String(element.className || ''),
        ]
          .map((value) => helpers.normalizeText(value))
          .join(' ')
          .toLowerCase();

        return /(date|calendar|dd\/mm|yyyy|mm\/dd)/.test(combinedText);
      },

      findFieldControl(root, keyword) {
        if (!root) {
          return null;
        }

        const labelCandidates = [...root.querySelectorAll('label, th, td, div, span, p, strong')].filter((element) => {
          if (!helpers.isVisible(element)) {
            return false;
          }

          const text = helpers.getText(element).toLowerCase();
          return (
            text === keyword.toLowerCase() ||
            text.startsWith(keyword.toLowerCase()) ||
            text.includes(`${keyword.toLowerCase()} *`) ||
            text.includes(`*${keyword.toLowerCase()}`)
          );
        });

        const scoredControls = [];
        for (const label of labelCandidates) {
          const labelRect = label.getBoundingClientRect();
          const candidateContainers = [
            label.closest('tr'),
            label.closest('.row'),
            label.closest('.form-group'),
            label.parentElement,
            label.parentElement?.parentElement,
            label.closest('div'),
            root,
          ].filter(Boolean);

          const seenContainers = new Set();
          for (const container of candidateContainers) {
            if (seenContainers.has(container)) {
              continue;
            }
            seenContainers.add(container);

            const controls = [...container.querySelectorAll('input, select, textarea, button, [role="combobox"], [role="textbox"], .select2-selection, .p-dropdown, .mat-select-value, .ant-select-selector')]
              .filter((element) => element !== label)
              .filter((element) => helpers.isLikelyFieldControl(element, keyword));

            for (const control of controls) {
              const controlRect = control.getBoundingClientRect();
              let score = 0;

              if (controlRect.left >= labelRect.left - 30) {
                score += 2;
              }
              if (controlRect.left >= labelRect.right - 20) {
                score += 5;
              }
              if (Math.abs(controlRect.top - labelRect.top) <= 50) {
                score += 5;
              }

              score -= Math.abs(controlRect.top - labelRect.top) / 100;
              score -= Math.abs(controlRect.left - labelRect.left) / 300;

              if (keyword === 'date' && helpers.looksLikeDateControl(control)) {
                score += 6;
              }
              if (keyword === 'location') {
                const className = String(control.className || '').toLowerCase();
                if (
                  control instanceof HTMLSelectElement ||
                  String(control.getAttribute?.('role') || '').toLowerCase() === 'combobox' ||
                  /(select|dropdown|combobox)/.test(className)
                ) {
                  score += 6;
                }
              }

              scoredControls.push({ control, score });
            }
          }
        }

        if (scoredControls.length > 0) {
          scoredControls.sort((left, right) => right.score - left.score);
          return scoredControls[0].control;
        }

        const genericControls = [...root.querySelectorAll('input, select, textarea, [role="combobox"], [role="textbox"], .select2-selection, .p-dropdown, .mat-select-value, .ant-select-selector')]
          .filter((element) => helpers.isLikelyFieldControl(element, keyword));

        if (keyword === 'date') {
          return genericControls.find((element) => helpers.looksLikeDateControl(element)) ?? genericControls[1] ?? genericControls[0] ?? null;
        }

        if (keyword === 'location') {
          return genericControls[0] ?? null;
        }

        return genericControls[0] ?? null;
      },

      clickBookingButton(label) {
        const root = helpers.findBookingRoot();
        if (!root) {
          return false;
        }

        const normalizedLabel = helpers.normalizeText(label).toLowerCase();
        const buttons = [...root.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')]
          .filter((element) => helpers.isVisible(element))
          .map((element) => ({
            element,
            text: helpers.getText(element).toLowerCase(),
          }))
          .filter(({ text }) => text && (text === normalizedLabel || text.includes(normalizedLabel)))
          .sort((left, right) => left.text.length - right.text.length);

        const target = buttons[0]?.element ?? null;
        if (!target) {
          return false;
        }

        target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        target.click();
        return true;
      },

      getBookingSnapshot() {
        const root = helpers.findBookingRoot();
        if (!root) {
          return {
            found: false,
            locationText: '',
            dateValue: '',
            dateKey: '',
          };
        }

        const locationControl = helpers.findFieldControl(root, 'location');
        const dateControl = helpers.findFieldControl(root, 'date');
        const dateValue = helpers.readControlValue(dateControl);

        return {
          found: true,
          locationText: helpers.readControlValue(locationControl),
          dateValue,
          dateKey: helpers.parseDateKey(dateValue),
        };
      },

      setLocationSelection(targetValue, targetLabel) {
        const root = helpers.findBookingRoot();
        if (!root) {
          return { ok: false, reason: 'booking-modal-not-found' };
        }

        const normalizedTargetLabel = helpers.normalizeLocationKey(targetLabel);
        const tryNativeSelects = () => {
          const selects = [...document.querySelectorAll('select')];
          for (const select of selects) {
            const option = [...select.options].find((candidate) => {
              const normalizedOptionText = helpers.normalizeLocationKey(candidate.textContent || candidate.label || '');
              return (
                (targetValue && candidate.value === targetValue) ||
                (normalizedTargetLabel && normalizedOptionText === normalizedTargetLabel)
              );
            });

            if (!option) {
              continue;
            }

            select.value = option.value;
            select.dispatchEvent(new Event('input', { bubbles: true }));
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { ok: true, mode: 'select', selectedText: helpers.normalizeText(option.textContent || option.label || '') };
          }

          return null;
        };

        const selectedViaNativeSelect = tryNativeSelects();
        if (selectedViaNativeSelect) {
          return selectedViaNativeSelect;
        }

        const locationControl = helpers.findFieldControl(root, 'location');
        if (!locationControl) {
          return { ok: false, reason: 'location-control-not-found' };
        }

        locationControl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        if (typeof locationControl.focus === 'function') {
          locationControl.focus();
        }
        locationControl.click();

        if (locationControl instanceof HTMLInputElement) {
          locationControl.value = targetLabel;
          locationControl.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const optionCandidates = [...document.querySelectorAll('li, [role="option"], option, a, button, div, span')]
          .filter((element) => helpers.isVisible(element))
          .map((element) => {
            const text = helpers.getText(element);
            const normalizedText = helpers.normalizeLocationKey(text);
            const rect = element.getBoundingClientRect();
            const controlRect = locationControl.getBoundingClientRect();
            const verticalDistance = Math.abs(rect.top - controlRect.bottom);
            const horizontalDistance = Math.abs(rect.left - controlRect.left);
            return {
              element,
              text,
              normalizedText,
              verticalDistance,
              horizontalDistance,
              area: rect.width * rect.height,
            };
          })
          .filter(({ normalizedText }) => {
            return (
              normalizedText &&
              normalizedText !== helpers.normalizeLocationKey(helpers.getText(root)) &&
              (
                normalizedText === normalizedTargetLabel ||
                normalizedText.includes(normalizedTargetLabel) ||
                normalizedTargetLabel.includes(normalizedText)
              )
            );
          })
          .sort((left, right) => {
            const leftExact = left.normalizedText === normalizedTargetLabel ? 0 : 1;
            const rightExact = right.normalizedText === normalizedTargetLabel ? 0 : 1;
            if (leftExact !== rightExact) {
              return leftExact - rightExact;
            }
            if (left.verticalDistance !== right.verticalDistance) {
              return left.verticalDistance - right.verticalDistance;
            }
            if (left.horizontalDistance !== right.horizontalDistance) {
              return left.horizontalDistance - right.horizontalDistance;
            }
            return left.area - right.area;
          });

        const target = optionCandidates[0]?.element ?? null;
        if (!target) {
          return { ok: false, reason: 'location-option-not-found' };
        }

        target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        target.click();
        return {
          ok: true,
          mode: 'option-click',
          selectedText: helpers.getText(target),
        };
      },

      openDatePicker() {
        const root = helpers.findBookingRoot();
        if (!root) {
          return false;
        }

        if (helpers.findDatePickerRoot()) {
          return true;
        }

        const dateControl = helpers.findFieldControl(root, 'date');
        if (dateControl) {
          dateControl.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
          if (typeof dateControl.focus === 'function') {
            dateControl.focus();
          }
          dateControl.click();
          return true;
        }

        return false;
      },

      scoreDatePickerRoot(element) {
        if (!helpers.isVisible(element)) {
          return -Infinity;
        }

        const text = helpers.getText(element).toLowerCase();
        if (!text) {
          return -Infinity;
        }

        const dayMatches = [...new Set((text.match(/\b([12]?\d|3[01])\b/g) ?? []).map((value) => Number(value)).filter((value) => value >= 1 && value <= 31))];
        const weekdayMatches = (text.match(/\b(su|mo|tu|we|th|fr|sa|sun|mon|tue|wed|thu|fri|sat)\b/g) ?? []).length;
        const hasMonthYear = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[^0-9]*(20\d{2})/.test(text);
        const className = String(element.className || '').toLowerCase();
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;

        let score = 0;
        if (hasMonthYear) score += 10;
        if (weekdayMatches >= 5) score += 8;
        if (dayMatches.length >= 7) score += 8;
        if (/(datepicker|date-picker|calendar)/.test(className)) score += 6;
        if (area >= 80_000 && area <= 700_000) score += 4;

        const bookingRoot = helpers.findBookingRoot();
        if (bookingRoot && bookingRoot === element) {
          score -= 20;
        }

        return score;
      },

      findDatePickerRoot() {
        const selector = [
          '.ui-datepicker',
          '.datepicker',
          '.xdsoft_datetimepicker',
          '.flatpickr-calendar',
          '.react-datepicker',
          '.mat-datepicker-content',
          '.p-datepicker',
          '.bootstrap-datetimepicker-widget',
          '.daterangepicker',
          '[class*="datepicker"]',
          '[class*="date-picker"]',
          '[class*="calendar"]',
          '[role="dialog"]',
          'dialog',
        ].join(', ');

        const candidates = [...document.querySelectorAll(selector)]
          .filter((element) => helpers.isVisible(element))
          .map((element) => ({
            element,
            score: helpers.scoreDatePickerRoot(element),
            area: helpers.getArea(element),
          }))
          .filter(({ score }) => score >= 14)
          .sort((left, right) => right.score - left.score || left.area - right.area);

        if (candidates.length > 0) {
          return candidates[0].element;
        }

        const genericCandidates = [...document.querySelectorAll('body *')]
          .filter((element) => helpers.isVisible(element))
          .map((element) => ({
            element,
            score: helpers.scoreDatePickerRoot(element),
            area: helpers.getArea(element),
          }))
          .filter(({ score }) => score >= 18)
          .sort((left, right) => right.score - left.score || left.area - right.area);

        return genericCandidates[0]?.element ?? null;
      },

      parseMonthYearContext(text) {
        const normalizedText = helpers.normalizeText(text).toLowerCase();
        const monthMatch = normalizedText.match(
          /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b[^0-9]*(\d{4})/
        );

        if (!monthMatch) {
          return null;
        }

        const monthIndex = MONTH_INDEX_BY_NAME[monthMatch[1]];
        return monthIndex == null ? null : { monthIndex, year: Number(monthMatch[2]) };
      },

      getDatePickerMonthContext(root, fallbackDateValue = '') {
        if (!root) {
          return null;
        }

        const fallbackDateKey = helpers.parseDateKey(fallbackDateValue);
        const fallbackDate = fallbackDateKey
          ? {
              year: Number(fallbackDateKey.slice(0, 4)),
              monthIndex: Number(fallbackDateKey.slice(5, 7)) - 1,
            }
          : null;

        const explicitMonthNodes = [
          ...root.querySelectorAll(
            [
              '.ui-datepicker-title',
              '.ui-datepicker-header',
              '.react-datepicker__current-month',
              '.flatpickr-current-month',
              '.flatpickr-month',
              '.p-datepicker-title',
              '.datepicker-switch',
              '[class*="datepicker"][class*="title"]',
              '[class*="datepicker"][class*="header"]',
              '[class*="calendar"][class*="header"]',
            ].join(', ')
          ),
        ]
          .filter((element) => helpers.isVisible(element))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              text: helpers.getText(element),
              top: rect.top,
              left: rect.left,
              area: rect.width * rect.height,
            };
          })
          .filter(({ text }) => Boolean(helpers.parseMonthYearContext(text)))
          .sort((left, right) => {
            if (Math.abs(left.top - right.top) > 12) {
              return left.top - right.top;
            }
            return left.area - right.area || left.left - right.left;
          });

        if (explicitMonthNodes.length > 0) {
          return helpers.parseMonthYearContext(explicitMonthNodes[0].text);
        }

        const headerMonth = root.querySelector(
          '.ui-datepicker-month, .flatpickr-monthDropdown-months, [class*="month"]'
        );
        const headerYear = root.querySelector('.ui-datepicker-year, [class*="year"]');
        const combinedHeaderText = `${helpers.getText(headerMonth)} ${helpers.getText(headerYear)}`.trim();
        const combinedHeaderContext = helpers.parseMonthYearContext(combinedHeaderText);
        if (combinedHeaderContext) {
          return combinedHeaderContext;
        }

        return helpers.parseMonthYearContext(helpers.getText(root)) ?? fallbackDate;
      },

      isDisabledDateTarget(element) {
        if (!element) {
          return true;
        }

        if (element.hasAttribute?.('disabled') || element.getAttribute?.('aria-disabled') === 'true') {
          return true;
        }

        const className = String(element.className || '').toLowerCase();
        return (
          /(disabled|unavailable|blocked|readonly|not-allowed)/.test(className) ||
          className.includes('ui-datepicker-other-month') ||
          className.split(/\s+/).some((token) => token === 'old' || token === 'new')
        );
      },

      getDateKeyParts(dateKey) {
        const parsedKey = helpers.parseDateKey(dateKey);
        if (!parsedKey) {
          return null;
        }

        return {
          dateKey: parsedKey,
          year: Number(parsedKey.slice(0, 4)),
          monthIndex: Number(parsedKey.slice(5, 7)) - 1,
          day: Number(parsedKey.slice(8, 10)),
          dayLabel: String(Number(parsedKey.slice(8, 10))),
        };
      },

      getClickableDateTarget(element) {
        if (!element) {
          return null;
        }

        const directTarget = element.matches?.('a, button, [role="button"]') ? element : null;
        if (directTarget && helpers.isVisible(directTarget)) {
          return directTarget;
        }

        const nestedTarget =
          element.querySelector?.('a, button, [role="button"], [data-handler="selectDay"] a, [data-handler="selectDay"] button') ??
          null;
        if (nestedTarget && helpers.isVisible(nestedTarget)) {
          return nestedTarget;
        }

        return element;
      },

      findExactDatePickerTarget(root, targetDateKey, fallbackDateValue) {
        const parts = helpers.getDateKeyParts(targetDateKey);
        if (!root || !parts) {
          return null;
        }

        const directMetadataTargets = [...root.querySelectorAll('[data-year][data-month], [data-date], [data-day]')]
          .filter((element) => helpers.isVisible(element))
          .map((element) => {
            const clickTarget = helpers.getClickableDateTarget(element);
            const label = helpers.getText(clickTarget) || helpers.getText(element);
            const dateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, element, label, clickTarget ?? element);
            return {
              element,
              clickTarget,
              label,
              dateKey,
              selectable: !helpers.isDisabledDateTarget(element) && !helpers.isDisabledDateTarget(clickTarget),
            };
          })
          .filter(({ dateKey, label }) => {
            if (dateKey === targetDateKey) {
              return true;
            }

            return label === parts.dayLabel;
          })
          .sort((left, right) => {
            const leftExact = left.dateKey === targetDateKey ? 0 : 1;
            const rightExact = right.dateKey === targetDateKey ? 0 : 1;
            return leftExact - rightExact;
          });

        if (directMetadataTargets.length > 0) {
          return directMetadataTargets[0];
        }

        const rawNodes = helpers.getDatePickerRawNodes(root);
        const seenTargets = new Set();
        for (const node of rawNodes) {
          const target = node.closest('button, td, a, [role="button"], [data-date], [data-day]') ?? node;
          if (!helpers.isVisible(target) || seenTargets.has(target)) {
            continue;
          }

          seenTargets.add(target);
          const clickTarget = helpers.getClickableDateTarget(target);
          const label = helpers.getText(clickTarget) || helpers.getText(node) || helpers.getText(target);
          const dateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, target, label, node);
          if (dateKey !== targetDateKey) {
            continue;
          }

          return {
            element: target,
            clickTarget,
            label,
            dateKey,
            selectable: !helpers.isDisabledDateTarget(target) && !helpers.isDisabledDateTarget(clickTarget),
          };
        }

        return null;
      },

      getDatePickerRawNodes(root) {
        if (!root) {
          return [];
        }

        return [...root.querySelectorAll('button, td, a, span, div, [role="button"], [data-date], [data-day]')].filter((element) => {
          if (!helpers.isVisible(element)) {
            return false;
          }

          const text = helpers.getText(element);
          if (!text) {
            return false;
          }

          const looksLikeSingleDay = /^\d{1,2}$/.test(text);
          const hasExplicitDateMetadata =
            !!helpers.parseDateKey(element.getAttribute?.('aria-label')) ||
            !!helpers.parseDateKey(element.getAttribute?.('title')) ||
            !!helpers.parseDateKey(element.getAttribute?.('data-date'));

          return looksLikeSingleDay || hasExplicitDateMetadata;
        });
      },

      resolveDateKeyForTarget(root, fallbackDateValue, target, sourceText, sourceNode = null) {
        const fallbackDateKey = helpers.parseDateKey(fallbackDateValue);
        const fallbackDate = fallbackDateKey
          ? {
              year: Number(fallbackDateKey.slice(0, 4)),
              monthIndex: Number(fallbackDateKey.slice(5, 7)) - 1,
            }
          : null;
        const monthYearContext = helpers.getDatePickerMonthContext(root, fallbackDateValue) ?? fallbackDate;

        const metadataSources = [sourceNode, target].filter(Boolean);
        for (const source of metadataSources) {
          const attributesToCheck = [
            source.getAttribute?.('aria-label'),
            source.getAttribute?.('title'),
            source.getAttribute?.('data-date'),
            source.getAttribute?.('data-day'),
            source.getAttribute?.('data-value'),
            source.getAttribute?.('data-original-title'),
            sourceText,
          ];

          for (const attributeValue of attributesToCheck) {
            const parsedKey = helpers.parseDateKey(attributeValue);
            if (parsedKey) {
              return parsedKey;
            }
          }

          const datasetYear = Number(source.getAttribute?.('data-year'));
          const datasetMonthRaw = Number(source.getAttribute?.('data-month'));
          const datasetDay = Number(source.getAttribute?.('data-day') || sourceText);
          if (
            Number.isFinite(datasetYear) &&
            Number.isFinite(datasetMonthRaw) &&
            Number.isFinite(datasetDay)
          ) {
            const isUiDatepickerCell =
              Boolean(root?.matches?.('.ui-datepicker')) ||
              Boolean(source.closest?.('.ui-datepicker')) ||
              source.hasAttribute?.('data-handler') ||
              source.hasAttribute?.('data-event');
            const monthIndex = isUiDatepickerCell
              ? datasetMonthRaw
              : datasetMonthRaw >= 1 && datasetMonthRaw <= 12
                ? datasetMonthRaw - 1
                : datasetMonthRaw;
            const parsedKey = helpers.createDateKey(datasetYear, monthIndex, datasetDay);
            if (parsedKey) {
              return parsedKey;
            }
          }
        }

        if (!monthYearContext) {
          return '';
        }

        const dayMatch = helpers.normalizeText(sourceText).match(/^(\d{1,2})$/);
        if (!dayMatch) {
          return '';
        }

        return helpers.createDateKey(monthYearContext.year, monthYearContext.monthIndex, Number(dayMatch[1]));
      },

      getDatePickerMonthContextData(fallbackDateValue) {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return null;
        }

        return helpers.getDatePickerMonthContext(root, fallbackDateValue);
      },

      getDatePickerCandidates(fallbackDateValue) {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return [];
        }

        const seenTargets = new Set();
        const candidates = [];
        const rawNodes = helpers.getDatePickerRawNodes(root);

        for (const node of rawNodes) {
          const target = node.closest('button, td, a, [role="button"], [data-date], [data-day]') ?? node;
          if (!helpers.isVisible(target) || helpers.isDisabledDateTarget(target) || seenTargets.has(target)) {
            continue;
          }

          seenTargets.add(target);
          const label = helpers.getText(node) || helpers.getText(target);
          const dateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, target, label, node);
          if (!dateKey) {
            continue;
          }

          if (candidates.some((candidate) => candidate.dateKey === dateKey)) {
            continue;
          }

          candidates.push({
            index: candidates.length,
            dateKey,
            label,
          });
        }

        return candidates;
      },

      clickDatePickerCandidate(candidateIndex, fallbackDateValue) {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return null;
        }

        const candidates = helpers.getDatePickerCandidates(fallbackDateValue);
        const candidate = candidates[candidateIndex] ?? null;
        if (!candidate) {
          return null;
        }

        const rawNodes = helpers.getDatePickerRawNodes(root);

        const matchingTargets = [];
        const seenTargets = new Set();
        for (const node of rawNodes) {
          const target = node.closest('button, td, a, [role="button"], [data-date], [data-day]') ?? node;
          if (!helpers.isVisible(target) || seenTargets.has(target)) {
            continue;
          }

          seenTargets.add(target);
          const targetText = helpers.getText(node) || helpers.getText(target);
          const targetDateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, target, targetText, node);
          if (targetDateKey === candidate.dateKey) {
            matchingTargets.push(target);
          }
        }

        const target = matchingTargets[0] ?? null;
        if (!target) {
          return null;
        }

        target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        target.click();
        return candidate;
      },

      inspectDatePickerDateKey(targetDateKey, fallbackDateValue) {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return { exists: false, selectable: false };
        }

        const exactTarget = helpers.findExactDatePickerTarget(root, targetDateKey, fallbackDateValue);
        if (exactTarget) {
          return {
            exists: true,
            selectable: exactTarget.selectable,
            label: exactTarget.label,
            className: String((exactTarget.clickTarget ?? exactTarget.element)?.className || ''),
            tagName: (exactTarget.clickTarget ?? exactTarget.element)?.tagName,
          };
        }

        const rawNodes = helpers.getDatePickerRawNodes(root);
        const seenTargets = new Set();

        for (const node of rawNodes) {
          const target = node.closest('button, td, a, [role="button"], [data-date], [data-day]') ?? node;
          if (!helpers.isVisible(target) || seenTargets.has(target)) {
            continue;
          }

          seenTargets.add(target);
          const label = helpers.getText(node) || helpers.getText(target);
          const dateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, target, label, node);
          if (dateKey !== targetDateKey) {
            continue;
          }

          return {
            exists: true,
            selectable: !helpers.isDisabledDateTarget(target),
            label,
            className: String(target.className || ''),
            tagName: target.tagName,
          };
        }

        return { exists: false, selectable: false };
      },

      clickDatePickerDateKey(targetDateKey, fallbackDateValue) {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return { clicked: false, exists: false, selectable: false };
        }

        const exactTarget = helpers.findExactDatePickerTarget(root, targetDateKey, fallbackDateValue);
        if (exactTarget) {
          if (!exactTarget.selectable) {
            return {
              clicked: false,
              exists: true,
              selectable: false,
              label: exactTarget.label,
              className: String((exactTarget.clickTarget ?? exactTarget.element)?.className || ''),
              tagName: (exactTarget.clickTarget ?? exactTarget.element)?.tagName,
            };
          }

          const clickTarget = exactTarget.clickTarget ?? exactTarget.element;
          clickTarget.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
          clickTarget.click();
          return {
            clicked: true,
            exists: true,
            selectable: true,
            label: exactTarget.label,
            className: String(clickTarget.className || ''),
            tagName: clickTarget.tagName,
          };
        }

        const rawNodes = helpers.getDatePickerRawNodes(root);
        const seenTargets = new Set();

        for (const node of rawNodes) {
          const target = node.closest('button, td, a, [role="button"], [data-date], [data-day]') ?? node;
          if (!helpers.isVisible(target) || seenTargets.has(target)) {
            continue;
          }

          seenTargets.add(target);
          const label = helpers.getText(node) || helpers.getText(target);
          const dateKey = helpers.resolveDateKeyForTarget(root, fallbackDateValue, target, label, node);
          if (dateKey !== targetDateKey) {
            continue;
          }

          const selectable = !helpers.isDisabledDateTarget(target);
          if (!selectable) {
            return {
              clicked: false,
              exists: true,
              selectable: false,
              label,
              className: String(target.className || ''),
              tagName: target.tagName,
            };
          }

          target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
          target.click();
          return {
            clicked: true,
            exists: true,
            selectable: true,
            label,
            className: String(target.className || ''),
            tagName: target.tagName,
          };
        }

        return { clicked: false, exists: false, selectable: false };
      },

      clickDatePickerNextMonth() {
        const root = helpers.findDatePickerRoot();
        if (!root) {
          return false;
        }

        const rootRect = root.getBoundingClientRect();
        const headerBottom = rootRect.top + Math.min(120, rootRect.height * 0.3);

        const candidates = [...root.querySelectorAll('button, a, span, div, i')]
          .filter((element) => helpers.isVisible(element))
          .map((element) => {
            const text = helpers.getText(element).toLowerCase();
            const className = String(element.className || '').toLowerCase();
            const ariaLabel = String(element.getAttribute?.('aria-label') || '').toLowerCase();
            const title = String(element.getAttribute?.('title') || '').toLowerCase();
            const descendantClassNames = [...element.querySelectorAll('*')]
              .map((node) => String(node.className || '').toLowerCase())
              .join(' ');
            const rect = element.getBoundingClientRect();
            let score = 0;

            const combinedText = `${text} ${className} ${ariaLabel} ${title} ${descendantClassNames}`;
            if (
              text === '>' ||
              text === '›' ||
              text === '»' ||
              /\bnext\b/.test(combinedText) ||
              /triangle-e|chevron-right|caret-right|arrow-right|icon-right|angle-right|right-arrow/.test(combinedText)
            ) {
              score += 20;
            }

            if (rect.top <= headerBottom) {
              score += 6;
            }

            if (rect.left >= rootRect.left + rootRect.width * 0.5) {
              score += 4;
            }

            if (rect.width <= 80 && rect.height <= 80) {
              score += 3;
            }

            if (rect.left >= rootRect.right - 120) {
              score += 5;
            }

            return {
              element,
              text,
              className,
              ariaLabel,
              title,
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              score,
            };
          })
          .filter(({ score }) => score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) {
              return right.score - left.score;
            }

            if (Math.abs(left.top - right.top) > 20) {
              return left.top - right.top;
            }

            return right.left - left.left;
          });

        let target = candidates[0]?.element ?? null;
        if (!target) {
          const fallbackCandidates = [...root.querySelectorAll('button, a, span, div')]
            .filter((element) => helpers.isVisible(element))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return (
                rect.top <= headerBottom &&
                rect.left >= rootRect.left + rootRect.width * 0.5 &&
                rect.left <= rootRect.right &&
                rect.width > 0 &&
                rect.height > 0
              );
            })
            .sort((left, right) => {
              const leftRect = left.getBoundingClientRect();
              const rightRect = right.getBoundingClientRect();
              if (rightRect.left !== leftRect.left) {
                return rightRect.left - leftRect.left;
              }
              return leftRect.top - rightRect.top;
            });

          target = fallbackCandidates[0] ?? null;
        }

        if (!target) {
          return false;
        }

        target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        target.click();
        return true;
      },

      extractSlotRows() {
        const root = helpers.findBookingRoot();
        if (!root) {
          return [];
        }

        const tableRows = [...root.querySelectorAll('tr')].filter((row) => helpers.isVisible(row));
        const slots = [];

        for (const row of tableRows) {
          const checkbox = row.querySelector('input[type="checkbox"]');
          const cells = [...row.querySelectorAll('th, td')]
            .map((cell) => helpers.getText(cell))
            .filter(Boolean);
          if (cells.length < 3) {
            continue;
          }

          const fromText = cells[1];
          const toText = cells[2];
          const key = helpers.buildTimeSlotKey(fromText, toText);
          if (!key) {
            continue;
          }

          slots.push({
            slot: cells[0],
            from: helpers.normalizeTimeLabel(fromText),
            to: helpers.normalizeTimeLabel(toText),
            key,
            status: cells.slice(3).join(' '),
            selectable: Boolean(
              checkbox &&
              !checkbox.disabled &&
              checkbox.getAttribute('aria-disabled') !== 'true'
            ),
          });
        }

        return slots;
      },

      selectSlotKeys(slotKeys) {
        const root = helpers.findBookingRoot();
        if (!root) {
          return { selectedKeys: [], unavailableKeys: [], missingKeys: [...slotKeys] };
        }

        const requestedKeys = new Set((slotKeys ?? []).map((slotKey) => helpers.normalizeText(slotKey)));
        const seenKeys = new Set();
        const selectedKeys = [];
        const unavailableKeys = [];

        const tableRows = [...root.querySelectorAll('tr')].filter((row) => helpers.isVisible(row));
        for (const row of tableRows) {
          const checkbox = row.querySelector('input[type="checkbox"]');
          const cells = [...row.querySelectorAll('th, td')]
            .map((cell) => helpers.getText(cell))
            .filter(Boolean);
          if (cells.length < 3) {
            continue;
          }

          const key = helpers.buildTimeSlotKey(cells[1], cells[2]);
          if (!requestedKeys.has(key)) {
            continue;
          }

          seenKeys.add(key);
          if (!checkbox || checkbox.disabled || checkbox.getAttribute('aria-disabled') === 'true') {
            unavailableKeys.push(key);
            continue;
          }

          checkbox.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
          if (!checkbox.checked) {
            checkbox.click();
          }
          selectedKeys.push(key);
        }

        const missingKeys = [...requestedKeys].filter((slotKey) => !seenKeys.has(slotKey));
        return {
          selectedKeys,
          unavailableKeys,
          missingKeys,
        };
      },
    };

    window.__liveMuseekNacHelpers = helpers;
  });
}

export async function waitForBookingModal(page) {
  await page.waitForFunction(
    () => {
      const helpers = window.__liveMuseekNacHelpers;
      return Boolean(helpers?.findBookingRoot?.());
    },
    { timeout: 30_000 }
  );
}

export async function getBookingSnapshot(page) {
  return page.evaluate(() => window.__liveMuseekNacHelpers?.getBookingSnapshot?.() ?? null);
}

export async function openBookingModal(page) {
  await installNacPageHelpers(page);
  const snapshot = await getBookingSnapshot(page);
  if (snapshot?.found) {
    return snapshot;
  }

  await waitForVisibleText(page, 'Submit Booking', 30_000);
  await clickVisibleElementByText(page, 'Submit Booking', 30_000);
  await waitForBookingModal(page);
  return getBookingSnapshot(page);
}

export async function clickBookingModalButton(page, label) {
  const clicked = await page.evaluate((targetLabel) => {
    return Boolean(window.__liveMuseekNacHelpers?.clickBookingButton?.(targetLabel));
  }, label);

  if (!clicked) {
    throw new Error(`Unable to find the "${label}" button inside the booking modal.`);
  }
}

export async function setBookingLocation(page, { locationId = '', locationName = '' }) {
  const selectionResult = await page.evaluate(
    ({ targetValue, targetLabel }) =>
      window.__liveMuseekNacHelpers?.setLocationSelection?.(targetValue, targetLabel) ?? { ok: false, reason: 'helper-not-installed' },
    {
      targetValue: locationId,
      targetLabel: locationName,
    }
  );

  if (!selectionResult?.ok) {
    throw new Error(`Unable to select location "${locationName}" in the booking modal (${selectionResult?.reason || 'unknown error'}).`);
  }

  await page.waitForFunction(
    (expectedLocationName) => {
      const snapshot = window.__liveMuseekNacHelpers?.getBookingSnapshot?.();
      const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^\*+/, '').replace(/[^a-z0-9]+/g, '');
      return normalize(snapshot?.locationText).includes(normalize(expectedLocationName));
    },
    { timeout: 10_000 },
    locationName
  );

  await sleep(500);
  return getBookingSnapshot(page);
}

export async function selectBookingDate(page, targetDateInput) {
  const targetDateKey = toDateKey(targetDateInput);
  if (!targetDateKey) {
    throw new Error(`Invalid booking date: ${targetDateInput}`);
  }

  const initialSnapshot = await getBookingSnapshot(page);
  if (initialSnapshot?.dateKey === targetDateKey) {
    return initialSnapshot;
  }

  const opened = await page.evaluate(() => Boolean(window.__liveMuseekNacHelpers?.openDatePicker?.()));
  if (!opened) {
    throw new Error('Unable to open the booking date picker.');
  }

  await sleep(300);

  const targetYear = Number(targetDateKey.slice(0, 4));
  const targetMonthIndex = Number(targetDateKey.slice(5, 7)) - 1;

  for (let monthAttempt = 0; monthAttempt < 12; monthAttempt += 1) {
    const currentSnapshot = await getBookingSnapshot(page);
    const [monthContext, candidates, targetInspection] = await Promise.all([
      page.evaluate((fallbackDateValue) => {
        return window.__liveMuseekNacHelpers?.getDatePickerMonthContextData?.(fallbackDateValue) ?? null;
      }, currentSnapshot?.dateValue ?? ''),
      page.evaluate((fallbackDateValue) => {
        return window.__liveMuseekNacHelpers?.getDatePickerCandidates?.(fallbackDateValue) ?? [];
      }, currentSnapshot?.dateValue ?? ''),
      page.evaluate(
        ({ expectedDateKey, fallbackDateValue }) => {
          return window.__liveMuseekNacHelpers?.inspectDatePickerDateKey?.(expectedDateKey, fallbackDateValue) ?? null;
        },
        {
          expectedDateKey: targetDateKey,
          fallbackDateValue: currentSnapshot?.dateValue ?? '',
        }
      ),
    ]);

    const exactCandidate = candidates.find((candidate) => candidate.dateKey === targetDateKey);
    if (exactCandidate || targetInspection?.exists) {
      const clickedCandidate = await page.evaluate(
        ({ candidateIndex, expectedDateKey, fallbackDateValue }) => {
          if (expectedDateKey) {
            const clickedByKey = window.__liveMuseekNacHelpers?.clickDatePickerDateKey?.(expectedDateKey, fallbackDateValue);
            if (clickedByKey?.exists) {
              return clickedByKey;
            }
          }

          return window.__liveMuseekNacHelpers?.clickDatePickerCandidate?.(candidateIndex, fallbackDateValue) ?? null;
        },
        {
          candidateIndex: exactCandidate?.index ?? -1,
          expectedDateKey: targetDateKey,
          fallbackDateValue: currentSnapshot?.dateValue ?? '',
        }
      );

      if (!clickedCandidate?.clicked && clickedCandidate?.exists && clickedCandidate?.selectable === false) {
        throw new Error(
          `The requested booking date ${targetDateKey} is visible in the NAC calendar but not selectable.`
        );
      }

      if (!clickedCandidate?.clicked) {
        throw new Error(`Date picker found ${targetDateKey}, but clicking it failed.`);
      }

      await page.waitForFunction(
        (expectedDateKey) => {
          const snapshot = window.__liveMuseekNacHelpers?.getBookingSnapshot?.();
          return snapshot?.dateKey === expectedDateKey;
        },
        { timeout: 5_000 },
        targetDateKey
      );

      await sleep(500);
      return getBookingSnapshot(page);
    }

    const currentMonthComparable = monthContext
      ? monthContext.year * 12 + monthContext.monthIndex
      : Number.NEGATIVE_INFINITY;
    const targetMonthComparable = targetYear * 12 + targetMonthIndex;
    if (currentMonthComparable === targetMonthComparable && !targetInspection?.exists) {
      throw new Error(
        `The requested booking date ${targetDateKey} was not found in the visible NAC calendar month.`
      );
    }
    if (currentMonthComparable >= targetMonthComparable) {
      break;
    }

    const movedToNextMonth = await page.evaluate(() => {
      return Boolean(window.__liveMuseekNacHelpers?.clickDatePickerNextMonth?.());
    });
    if (!movedToNextMonth) {
      break;
    }

    try {
      await page.waitForFunction(
        (previousComparable) => {
          const snapshot = window.__liveMuseekNacHelpers?.getBookingSnapshot?.();
          const monthContext = window.__liveMuseekNacHelpers?.getDatePickerMonthContextData?.(snapshot?.dateValue ?? '');
          if (!monthContext) {
            return false;
          }

          const comparable = monthContext.year * 12 + monthContext.monthIndex;
          return comparable > previousComparable;
        },
        { timeout: 3_000 },
        currentMonthComparable
      );
    } catch (error) {
      await sleep(500);
    }
  }

  throw new Error(`Unable to select the requested booking date ${targetDateKey}. NAC does not appear to allow it.`);
}

export async function loadSlotsForSelectedDate(
  page,
  from,
  to,
  { timeoutMs = 15_000, maxAttempts = 2 } = {}
) {
  const requestedSlotKeys = expandTimeRangeToSlotKeys(from, to);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.log(
      `Clicking Load for the selected booking date (attempt ${attempt}/${maxAttempts}).`
    );

    try {
      const [availabilityResponse] = await Promise.all([
        page.waitForResponse(
          (response) => {
            const url = String(response.url?.() ?? '').toLowerCase();
            const method = String(response.request?.().method?.() ?? '').toUpperCase();
            return method === 'GET' && url.includes('/availablities?date=');
          },
          { timeout: timeoutMs }
        ),
        clickBookingModalButton(page, 'Load'),
      ]);

      if (!availabilityResponse.ok()) {
        throw new Error(
          `NAC availability request returned ${availabilityResponse.status()} ${availabilityResponse.statusText()}.`
        );
      }

      await page.waitForFunction(
        (expectedSlotKeys) => {
          const rows = window.__liveMuseekNacHelpers?.extractSlotRows?.() ?? [];
          const renderedSlotKeys = new Set(rows.map((row) => row.key));
          return expectedSlotKeys.every((slotKey) => renderedSlotKeys.has(slotKey));
        },
        { timeout: timeoutMs, polling: 200 },
        requestedSlotKeys
      );

      return;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`NAC slots did not finish loading: ${message}. Retrying Load once.`);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
  throw new Error(
    `Unable to load requested NAC slots ${requestedSlotKeys.join(', ')} after ${maxAttempts} attempts: ${message}`
  );
}

export async function extractRenderedSlotRows(page) {
  return page.evaluate(() => window.__liveMuseekNacHelpers?.extractSlotRows?.() ?? []);
}

export async function selectBookingTimeRange(page, from, to) {
  const slotKeys = expandTimeRangeToSlotKeys(from, to);
  const selectionResult = await page.evaluate(
    (requestedSlotKeys) =>
      window.__liveMuseekNacHelpers?.selectSlotKeys?.(requestedSlotKeys) ?? {
        selectedKeys: [],
        unavailableKeys: requestedSlotKeys,
        missingKeys: [],
      },
    slotKeys
  );

  if (selectionResult.unavailableKeys.length > 0 || selectionResult.missingKeys.length > 0) {
    throw new Error(
      `Unable to select the requested slots. unavailable=${selectionResult.unavailableKeys.join(', ') || 'none'} missing=${selectionResult.missingKeys.join(', ') || 'none'}`
    );
  }

  return selectionResult;
}

export async function submitBooking(page) {
  await clickBookingModalButton(page, 'Submit');

  try {
    await page.waitForFunction(
      () => {
        const text = (document.body?.innerText ?? '').toLowerCase();
        return text.includes('are you sure') && text.includes('create a booking');
      },
      { timeout: 5_000 }
    );

    const clickedConfirmation = await page.evaluate(() => {
      const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (element) => {
        if (!(element instanceof Element)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const dialogCandidates = [
        ...document.querySelectorAll('[role="dialog"], dialog, .swal2-popup, .modal, .ui-dialog, .sweet-alert'),
      ]
        .filter((element) => isVisible(element))
        .map((element) => ({
          element,
          text: normalize(element.innerText || element.textContent || ''),
          area: (() => {
            const rect = element.getBoundingClientRect();
            return rect.width * rect.height;
          })(),
        }))
        .filter(({ text }) => text.includes('are you sure') || text.includes('create a booking'))
        .sort((left, right) => right.area - left.area);

      const confirmationRoot = dialogCandidates[0]?.element ?? null;
      if (!confirmationRoot) {
        return false;
      }

      const buttonCandidates = [...confirmationRoot.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')]
        .filter((element) => isVisible(element))
        .map((element) => ({
          element,
          text: normalize(
            element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type)
              ? element.value
              : element.innerText || element.textContent || ''
          ),
        }))
        .filter(({ text }) => text === 'yes' || text.includes('yes'))
        .sort((left, right) => left.text.length - right.text.length);

      const target = buttonCandidates[0]?.element ?? null;
      if (!target) {
        return false;
      }

      target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
      target.click();
      return true;
    });

    if (!clickedConfirmation) {
      await clickVisibleElementByText(page, 'Yes', 5_000);
    }
  } catch (error) {
    // Some flows may submit immediately without a confirmation step.
  }

  try {
    await Promise.race([
      page.waitForFunction(
        () => {
          const text = (document.body?.innerText ?? '').toLowerCase();
          return /success|submitted|confirmed|booked/i.test(text);
        },
        { timeout: 10_000 }
      ),
      page.waitForFunction(
        () => {
          const helpers = window.__liveMuseekNacHelpers;
          return !helpers?.findBookingRoot?.();
        },
        { timeout: 10_000 }
      ),
    ]);
  } catch (error) {
    await sleep(3000);
  }

  const dismissTarget = await page.evaluate(() => {
    const helpers = window.__liveMuseekNacHelpers;
    const bookingRoot = helpers?.findBookingRoot?.() ?? null;
    const isVisible = (element) => {
      if (!(element instanceof Element)) {
        return false;
      }

      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }

      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const popupCandidates = [...document.querySelectorAll('[role="dialog"], dialog, .swal2-popup, .sweet-alert, .modal, .ui-dialog')]
      .filter((element) => isVisible(element))
      .filter((element) => !bookingRoot || element !== bookingRoot)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: String(element.innerText || element.textContent || '').toLowerCase(),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
          area: rect.width * rect.height,
        };
      })
      .filter(({ text }) => /success|submitted|confirmed|booked|are you sure|create a booking/.test(text))
      .sort((left, right) => right.area - left.area);

    const popup = popupCandidates[0] ?? null;
    if (!popup) {
      return null;
    }

    const margin = 20;
    if (popup.left > margin) {
      return { x: Math.max(10, popup.left - margin), y: Math.max(10, popup.top + margin) };
    }
    if (window.innerWidth - popup.right > margin) {
      return { x: Math.min(window.innerWidth - 10, popup.right + margin), y: Math.max(10, popup.top + margin) };
    }
    if (popup.top > margin) {
      return { x: Math.max(10, popup.left + margin), y: Math.max(10, popup.top - margin) };
    }

    return { x: 10, y: 10 };
  });

  if (dismissTarget) {
    await page.mouse.click(dismissTarget.x, dismissTarget.y);
    await sleep(600);
  }

  const modalStillOpen = await page.evaluate(() => Boolean(window.__liveMuseekNacHelpers?.findBookingRoot?.()));
  const pageText = normalizeText(await getPageText(page));
  const lowerText = pageText.toLowerCase();
  const success = !modalStillOpen || /success|submitted|confirmed|booked/.test(lowerText);

  return {
    success,
    modalStillOpen,
    textSnippet: pageText.slice(0, 500),
  };
}
