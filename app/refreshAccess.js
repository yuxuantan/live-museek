export function isLocalhostHostname(hostname) {
  const normalizedHostname = String(hostname ?? '').trim().toLowerCase();
  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]'
  );
}

export function getRequestHostname(request) {
  const forwardedHost = request?.headers?.get('x-forwarded-host');
  if (forwardedHost) {
    return forwardedHost.split(',')[0].trim().split(':')[0].toLowerCase();
  }

  const host = request?.headers?.get('host');
  if (host) {
    return host.trim().split(':')[0].toLowerCase();
  }

  try {
    return new URL(request?.url ?? '').hostname.toLowerCase();
  } catch (error) {
    return '';
  }
}
