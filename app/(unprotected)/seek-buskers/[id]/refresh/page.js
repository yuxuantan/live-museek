'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  getBuskerRefreshCooldownKey,
  setRefreshCooldown,
  REFRESH_BUTTON_COOLDOWN_MS,
} from '../../../../refreshCooldown';
import { isLocalhostHostname } from '../../../../refreshAccess';

export default function RefreshBuskerPage({ params }) {
  const hasStartedRef = useRef(false);
  const [status, setStatus] = useState('Starting refresh...');
  const [error, setError] = useState('');
  const [isLocalRefreshEnabled, setIsLocalRefreshEnabled] = useState(false);
  const [hasResolvedEnvironment, setHasResolvedEnvironment] = useState(false);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    const isAllowed = isLocalhostHostname(window.location.hostname);
    setIsLocalRefreshEnabled(isAllowed);
    setHasResolvedEnvironment(true);

    if (!isAllowed) {
      setStatus('Refresh from NAC is only available on localhost.');
      setError('Refresh from NAC is disabled in production.');
      return;
    }

    hasStartedRef.current = true;
    const refreshCooldownKey = getBuskerRefreshCooldownKey(params.id);
    setRefreshCooldown(refreshCooldownKey, REFRESH_BUTTON_COOLDOWN_MS);

    const refreshBusker = async () => {
      try {
        setStatus('Scraping NAC and updating this busker profile and events...');

        const response = await fetch(`/api/seek-buskers/${params.id}/refresh`, {
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
          `Updated ${payload?.busker?.name || 'this busker'} with ${payload?.performanceCount ?? 0} current or upcoming performances. Past bookings were retained for analytics. Redirecting...`
        );

        window.setTimeout(() => {
          window.location.replace(`/seek-buskers/${params.id}?refreshedAt=${Date.now()}`);
        }, 800);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error
            ? refreshError.message
            : 'Refresh failed.'
        );
      }
    };

    refreshBusker();
  }, [params.id]);

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6">
      <div className="card rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-semibold mb-3">Refreshing busker</h1>
        <p className="text-gray-600 mb-4">{status}</p>

        {!hasResolvedEnvironment ? (
          <div className="flex items-center gap-3 text-gray-600">
            <span className="loading loading-spinner loading-md" aria-hidden />
            <span>Checking refresh availability...</span>
          </div>
        ) : error ? (
          <div className="space-y-4">
            <p className="text-red-600">{error}</p>
            <Link
              href={`/seek-buskers/${params.id}`}
              className="btn btn-outline btn-sm"
            >
              Back to busker
            </Link>
          </div>
        ) : isLocalRefreshEnabled ? (
          <div className="flex items-center gap-3 text-gray-600">
            <span className="loading loading-spinner loading-md" aria-hidden />
            <span>This page will redirect when the refresh finishes.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
