const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX_REQUESTS_PER_WINDOW = 3;
const DEFAULT_MAX_CONCURRENT_REFRESHES = 1;
const DEFAULT_MINIMUM_START_INTERVAL_MS = 2_000;
const DEFAULT_BUSY_RETRY_AFTER_MS = 15_000;

// This guard protects each running application instance. Keep the public API
// fail-fast here even when deployment-level rate limiting is also configured.

export class PublicRefreshGuardError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'PublicRefreshGuardError';
    this.status = options.status ?? 429;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

function normalizeClientIdentifier(value) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, 128) : 'unknown';
}

export function getRefreshClientIdentifier(request) {
  const directClientHeaders = [
    'x-vercel-forwarded-for',
    'cf-connecting-ip',
    'x-real-ip',
  ];

  for (const headerName of directClientHeaders) {
    const value = request?.headers?.get(headerName);
    if (value) {
      return normalizeClientIdentifier(value.split(',')[0]);
    }
  }

  const forwardedFor = request?.headers?.get('x-forwarded-for');
  if (forwardedFor) {
    return normalizeClientIdentifier(forwardedFor.split(',')[0]);
  }

  return 'unknown';
}

export function createPublicRefreshGuard(options = {}) {
  const now = options.now ?? (() => Date.now());
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequestsPerWindow =
    options.maxRequestsPerWindow ?? DEFAULT_MAX_REQUESTS_PER_WINDOW;
  const maxConcurrentRefreshes =
    options.maxConcurrentRefreshes ?? DEFAULT_MAX_CONCURRENT_REFRESHES;
  const minimumStartIntervalMs =
    options.minimumStartIntervalMs ?? DEFAULT_MINIMUM_START_INTERVAL_MS;
  const busyRetryAfterMs = options.busyRetryAfterMs ?? DEFAULT_BUSY_RETRY_AFTER_MS;

  const state = {
    activeCount: 0,
    lastStartedAt: 0,
    clientStarts: new Map(),
  };

  const retryAfterSeconds = (milliseconds) =>
    Math.max(1, Math.ceil(milliseconds / 1000));

  const pruneClientStarts = (currentTime) => {
    const windowStart = currentTime - windowMs;

    for (const [clientId, starts] of state.clientStarts.entries()) {
      const recentStarts = starts.filter((startedAt) => startedAt > windowStart);
      if (recentStarts.length === 0) {
        state.clientStarts.delete(clientId);
      } else if (recentStarts.length !== starts.length) {
        state.clientStarts.set(clientId, recentStarts);
      }
    }
  };

  const acquire = (request) => {
    const currentTime = now();
    const clientId = getRefreshClientIdentifier(request);
    pruneClientStarts(currentTime);

    if (state.activeCount >= maxConcurrentRefreshes) {
      throw new PublicRefreshGuardError(
        'Refresh capacity is currently busy. Please try again shortly.',
        { retryAfterSeconds: retryAfterSeconds(busyRetryAfterMs) }
      );
    }

    const sinceLastStart = currentTime - state.lastStartedAt;
    if (state.lastStartedAt > 0 && sinceLastStart < minimumStartIntervalMs) {
      throw new PublicRefreshGuardError(
        'Refresh requests are starting too quickly. Please try again shortly.',
        {
          retryAfterSeconds: retryAfterSeconds(
            minimumStartIntervalMs - sinceLastStart
          ),
        }
      );
    }

    const clientStarts = state.clientStarts.get(clientId) ?? [];
    if (clientStarts.length >= maxRequestsPerWindow) {
      const retryAt = clientStarts[0] + windowMs;
      throw new PublicRefreshGuardError(
        'You have reached the refresh limit. Please try again later.',
        {
          retryAfterSeconds: retryAfterSeconds(retryAt - currentTime),
        }
      );
    }

    state.activeCount += 1;
    state.lastStartedAt = currentTime;
    state.clientStarts.set(clientId, [...clientStarts, currentTime]);

    let released = false;
    return () => {
      if (released) {
        return;
      }

      released = true;
      state.activeCount = Math.max(0, state.activeCount - 1);
    };
  };

  const run = async (request, action) => {
    const release = acquire(request);

    try {
      return await action();
    } finally {
      release();
    }
  };

  return { acquire, run };
}

const publicRefreshGuard =
  globalThis.__liveMuseekPublicRefreshGuard ??
  (globalThis.__liveMuseekPublicRefreshGuard = createPublicRefreshGuard());

export function withPublicRefreshGuard(request, action) {
  return publicRefreshGuard.run(request, action);
}
