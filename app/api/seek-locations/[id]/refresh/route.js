import { LocationRefreshError, refreshLocationById } from '../../../../server/nac_location_refresh.js';
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
      refreshLocationById(params.id)
    );

    return Response.json({
      ok: true,
      location: result.location,
      performanceCount: result.performanceCount,
      historicalPerformanceCountPreserved:
        result.historicalPerformanceCountPreserved,
      buskersUpserted: result.buskersUpserted,
      failedBuskerIds: result.failedBuskerIds,
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
      : 'Failed to refresh location.';
    const headers = { 'Cache-Control': 'no-store' };

    if (status >= 500) {
      console.error('Location refresh failed:', error);
    }

    if (isHandledError && error.retryAfterSeconds) {
      headers['Retry-After'] = String(error.retryAfterSeconds);
    }

    return Response.json({ error: message }, { status, headers });
  }
}
