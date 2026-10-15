import { expandTimeRangeToSlotKeys, toDateKey } from './nac_common.js';

// An account cannot perform two sets at the same time, even at different locations.
export function validateBookingPlan(requests) {
  const occupied = new Map();
  for (const request of requests) {
    const date = toDateKey(request.date);
    if (!date) throw new Error(`Invalid booking date: ${request.date}`);
    for (const slot of expandTimeRangeToSlotKeys(request.from, request.to)) {
      const key = `${date}/${slot}`;
      if (occupied.has(key)) {
        throw new Error(`Overlapping booking requests "${occupied.get(key)}" and "${request.label}" at ${key}.`);
      }
      occupied.set(key, request.label);
    }
  }
}

export function createLimiter(concurrency) {
  let active = 0;
  const pending = [];
  const drain = () => {
    while (active < concurrency && pending.length) {
      const { task, resolve, reject } = pending.shift();
      active += 1;
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        active -= 1;
        drain();
      });
    }
  };
  return (task) => new Promise((resolve, reject) => {
    pending.push({ task, resolve, reject });
    drain();
  });
}

export function stopBookingQueue(control, result, worker) {
  control.stopped = true;
  // Cancellation in another worker is a consequence, not a replacement cause.
  if (control.stopReason || result.outcome === 'not-submitted') return;
  control.stopReason = {
    label: result.request.label,
    date: result.request.date,
    from: result.request.from,
    to: result.request.to,
    outcome: result.outcome || 'failed',
    worker,
    error: result.errors?.at(-1)?.error || 'Booking worker stopped unexpectedly.',
  };
  control.onStop?.(control.stopReason);
}

export function summarizeBookingRun(results, { durationMs, workerErrors, stopReason }) {
  const skipped = results.filter((result) => ['not-started', 'not-submitted'].includes(result.outcome));
  const attempted = results.filter((result) => !skipped.includes(result));
  return {
    durationMs,
    counts: {
      confirmed: attempted.filter((result) => result.success).length,
      failed: attempted.filter((result) => !result.success).length,
      skipped: skipped.length,
    },
    stopReason: stopReason ?? null,
    workerErrors,
    results: attempted.map((result) => ({
      label: result.request.label, success: result.success, outcome: result.outcome,
      stopQueue: Boolean(result.stopQueue),
      date: result.request.date, from: result.request.from, to: result.request.to,
      locationName: result.location?.name, locationId: result.location?.location_id,
      worker: result.worker, durationMs: result.durationMs, errors: result.errors,
      timings: result.timings,
    })),
    skipped: skipped.map((result) => ({
      label: result.request.label, date: result.request.date,
      from: result.request.from, to: result.request.to, outcome: result.outcome,
    })),
  };
}

// In-flight submissions finish, but a halted queue cannot assign or submit more work.
export async function runBookingQueue({
  requests, pages, stopOnFailure, control, attempt,
  preparePage = async (page) => page,
  workerErrors = [],
}) {
  validateBookingPlan(requests);
  const results = new Array(requests.length);
  let next = 0;
  await Promise.all(pages.map(async (initialPage, workerIndex) => {
    let page;
    try {
      // Each worker becomes eligible independently. Loading tabs do not claim
      // requests or hold up tabs that are already ready to book.
      page = await preparePage(initialPage, workerIndex + 1);
    } catch (error) {
      workerErrors.push({ worker: workerIndex + 1, stage: 'tab-startup', error: error.message });
      // A tab that never became ready has not submitted anything. Other
      // workers can safely continue; Promise.all still drains in-flight work.
      return;
    }
    while (!control.stopped && next < requests.length) {
      const index = next++;
      const request = requests[index];
      const started = Date.now();
      let result;
      try {
        result = await attempt(page, request, workerIndex + 1);
      } catch (error) {
        result = { success: false, request, outcome: error.outcome || 'failed', errors: [{ error: error.message }] };
        // Unexpected worker errors must not leave other workers scheduling more work.
        stopBookingQueue(control, result, workerIndex + 1);
      }
      results[index] = { ...result, worker: workerIndex + 1, durationMs: Date.now() - started };
      if (result.stopQueue || (!result.success && stopOnFailure)) stopBookingQueue(control, result, workerIndex + 1);
    }
  }));
  return Array.from(results, (result, index) => result ?? {
    request: requests[index], success: false, outcome: 'not-started',
    skippedBecause: control.stopped ? 'queue-stopped' : 'no-ready-tab',
  });
}
