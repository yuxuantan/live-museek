'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  getLocationRefreshCooldownKey,
  setRefreshCooldown,
  REFRESH_BUTTON_COOLDOWN_MS,
} from '../../../../refreshCooldown';

export default function RefreshLocationPage({ params }) {
  const hasStartedRef = useRef(false);
  const [status, setStatus] = useState('Starting refresh...');
  const [error, setError] = useState('');

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    const refreshCooldownKey = getLocationRefreshCooldownKey(params.id);
    setRefreshCooldown(refreshCooldownKey, REFRESH_BUTTON_COOLDOWN_MS);

    const refreshLocation = async () => {
      try {
        setStatus('Scraping NAC and updating the database for this location...');

        const response = await fetch(`/api/seek-locations/${params.id}/refresh`, {
          method: 'POST',
          cache: 'no-store',
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const retryAfterSeconds = Number(response.headers.get('Retry-After') || 0);
          if (retryAfterSeconds > 0) {
            setRefreshCooldown(refreshCooldownKey, retryAfterSeconds * 1000);
          }
          throw new Error(payload?.error || 'Refresh failed.');
        }

        setStatus(
          `Updated ${payload?.location?.name || 'this location'} with ${payload?.performanceCount ?? 0} current or upcoming performances. Past bookings were retained for analytics. Redirecting...`
        );

        window.setTimeout(() => {
          window.location.replace(`/seek-locations/${params.id}?refreshedAt=${Date.now()}`);
        }, 800);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Refresh failed.'
        );
      }
    };

    refreshLocation();
  }, [params.id]);

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6">
      <div className="card rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-semibold mb-3">Refreshing location</h1>
        <p className="text-gray-600 mb-4">{status}</p>

        {error ? (
          <div className="space-y-4">
            <p className="text-red-600">{error}</p>
            <Link
              href={`/seek-locations/${params.id}`}
              className="btn btn-outline btn-sm"
            >
              Back to location
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-gray-600">
            <span className="loading loading-spinner loading-md" aria-hidden />
            <span>This page will redirect when the refresh finishes.</span>
          </div>
        )}
      </div>
    </div>
  );
}
