export const REFRESH_BUTTON_COOLDOWN_MS = 20_000;

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getLocationRefreshCooldownKey(locationId) {
  return `location-refresh:${locationId}`;
}

export function getBuskerRefreshCooldownKey(buskerId) {
  return `busker-refresh:${buskerId}`;
}

export function setRefreshCooldown(key, durationMs = REFRESH_BUTTON_COOLDOWN_MS) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(key, String(Date.now() + durationMs));
}

export function getRefreshCooldownRemainingMs(key) {
  if (!isBrowser()) {
    return 0;
  }

  const rawValue = window.localStorage.getItem(key);
  const cooldownUntil = Number(rawValue);
  if (!Number.isFinite(cooldownUntil) || cooldownUntil <= 0) {
    return 0;
  }

  const remainingMs = cooldownUntil - Date.now();
  if (remainingMs <= 0) {
    window.localStorage.removeItem(key);
    return 0;
  }

  return remainingMs;
}
