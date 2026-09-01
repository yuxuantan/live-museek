import { LocationRefreshError, refreshBuskerById } from '../../../../server/nac_location_refresh.js';
import {
  PublicRefreshGuardError,
  withPublicRefreshGuard,
} from '../../../../server/public_refresh_guard.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request, { params }) {
  try {
    const result = await withPublicRefreshGuard(request, () =>
      refreshBuskerById(params.id)
    );

    return Response.json({
      ok: true,
      busker: result.busker,
      performanceCount: result.performanceCount,
      historicalPerformanceCountPreserved:
        result.historicalPerformanceCountPreserved,
      locationsRefreshed: result.locationsRefreshed,
      fallbackLocations: result.fallbackLocations,
      failedLocationIds: result.failedLocationIds,
      changed: result.changed,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const isHandledError =
      error instanceof LocationRefreshError ||
      error instanceof PublicRefreshGuardError;
    const status = isHandledError ? error.status : 500;
    const message = isHandledError
      ? error.message
      : 'Failed to refresh musician.';
    const headers = { 'Cache-Control': 'no-store' };

    if (status >= 500) {
      console.error('Musician refresh failed:', error);
    }

    if (isHandledError && error.retryAfterSeconds) {
      headers['Retry-After'] = String(error.retryAfterSeconds);
    }

    return Response.json({ error: message }, { status, headers });
  }
}
