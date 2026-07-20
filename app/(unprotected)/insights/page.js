'use client';

import React, { useEffect, useState } from 'react';
import { isLocalhostHostname } from '../../refreshAccess';

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }

  return `${(value * 100).toFixed(1)}%`;
}

function formatTimestamp(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function compareRows(left, right, sortKey) {
  if (sortKey === 'locationName') {
    return left.locationName.localeCompare(right.locationName);
  }

  if (sortKey === 'daysWithUniverse') {
    return (
      (right.daysWithUniverse ?? 0) - (left.daysWithUniverse ?? 0) ||
      left.locationName.localeCompare(right.locationName)
    );
  }

  return (
    (right[sortKey] ?? Number.NEGATIVE_INFINITY) - (left[sortKey] ?? Number.NEGATIVE_INFINITY) ||
    left.locationName.localeCompare(right.locationName)
  );
}

const InsightsPage = () => {
  const [isLocalhost, setIsLocalhost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('bookingRate');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [refreshStatus, setRefreshStatus] = useState('');

  useEffect(() => {
    setIsLocalhost(isLocalhostHostname(window.location.hostname));
  }, []);

  useEffect(() => {
    if (isLocalhost !== true) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadSnapshot = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/insights', {
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load insights snapshot.');
        }

        if (!cancelled) {
          const rankingRows = payload?.rankings?.byBookingRate ?? [];
          setSnapshot(payload);
          setSelectedLocationId(rankingRows[0]?.locationId ?? '');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      cancelled = true;
    };
  }, [isLocalhost]);

  const handleRefresh = async (event) => {
    event.preventDefault();
    setRefreshing(true);
    setRefreshError('');
    setRefreshStatus(
      fromDate && toDate
        ? `Refreshing ${fromDate} to ${toDate}. This can take several minutes...`
        : 'Refreshing the latest rolling window. This can take several minutes...'
    );

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fromDate, toDate }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to refresh Insights.');
      }

      const nextSnapshot = payload?.snapshot;
      if (!nextSnapshot) {
        throw new Error('The refresh completed without returning a snapshot.');
      }

      const nextRankingRows = nextSnapshot?.rankings?.byBookingRate ?? [];
      setSnapshot(nextSnapshot);
      setError('');
      setSelectedLocationId((currentLocationId) =>
        nextSnapshot?.aggregateByLocationId?.[currentLocationId]
          ? currentLocationId
          : nextRankingRows[0]?.locationId ?? ''
      );
      setRefreshStatus(
        `Updated ${nextSnapshot.window?.startDateKey} to ${nextSnapshot.window?.endDateKey}.`
      );
    } catch (refreshRequestError) {
      setRefreshStatus('');
      setRefreshError(
        refreshRequestError instanceof Error
          ? refreshRequestError.message
          : 'Failed to refresh Insights.'
      );
    } finally {
      setRefreshing(false);
    }
  };

  const hasIncompleteCustomWindow = Boolean(fromDate) !== Boolean(toDate);
  const hasReversedCustomWindow = Boolean(fromDate && toDate && toDate < fromDate);
  const refreshDisabled =
    loading || refreshing || hasIncompleteCustomWindow || hasReversedCustomWindow;

  const rankingRows = [...(snapshot?.rankings?.byBookingRate ?? [])]
    .filter((row) =>
      row.locationName.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
    .sort((left, right) => compareRows(left, right, sortKey));

  const selectedAggregate = selectedLocationId
    ? snapshot?.aggregateByLocationId?.[selectedLocationId] ?? null
    : null;
  const selectedDateRows = Object.entries(selectedAggregate?.byDate ?? {})
    .map(([dateKey, value]) => ({
      dateKey,
      ...value,
    }))
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  if (isLocalhost === false) {
    return (
      <div className="container mx-auto p-6">
        <div className="card p-6">
          <h1 className="text-3xl font-bold mb-4">Insights</h1>
          <p>Insights are only available on localhost.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="card p-6">
        <h1 className="text-3xl font-bold mb-2">Insights</h1>
        <p className="text-gray-500">
          Booking rate is calculated as booked slots divided by the bookable universe.
          Bookable universe = NAC available slots + booked slots from Supabase.
        </p>
      </div>

      <form className="card p-6 space-y-4" onSubmit={handleRefresh}>
        <div>
          <h2 className="text-2xl font-semibold">Refresh data</h2>
          <p className="text-gray-500">
            Leave both dates blank to use the latest rolling window, or choose a custom window of up to 62 days.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <label className="form-control w-full">
            <span className="label-text mb-2">Start date</span>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="input-box"
              disabled={refreshing}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2">End date</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              className="input-box"
              disabled={refreshing}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={refreshDisabled}>
              {refreshing && <span className="loading loading-spinner loading-sm" aria-hidden />}
              {refreshing ? 'Refreshing...' : 'Refresh data'}
            </button>
            {(fromDate || toDate) && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setRefreshError('');
                }}
                disabled={refreshing}
              >
                Use latest window
              </button>
            )}
          </div>
        </div>

        {hasIncompleteCustomWindow && (
          <p className="text-amber-600">Choose both dates for a custom window.</p>
        )}
        {hasReversedCustomWindow && (
          <p className="text-amber-600">The end date must be on or after the start date.</p>
        )}
        {refreshStatus && (
          <p className="text-green-700" role="status" aria-live="polite">
            {refreshStatus}
          </p>
        )}
        {refreshError && (
          <p className="text-red-600" role="alert">
            {refreshError}
          </p>
        )}
      </form>

      {loading && (
        <div className="card p-6">
          <p>Loading insights snapshot...</p>
        </div>
      )}

      {!loading && error && (
        <div className="card p-6">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {!loading && !error && snapshot && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="card p-4">
              <div className="text-sm text-gray-500">Window</div>
              <div className="text-lg font-semibold">
                {snapshot.window?.startDateKey} to {snapshot.window?.endDateKey}
              </div>
              <div className="text-sm text-gray-500">
                {snapshot.window?.dateKeys?.length ?? 0} dates, rule {snapshot.window?.selectionRule}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-gray-500">Generated</div>
              <div className="text-lg font-semibold">{formatTimestamp(snapshot.generatedAt)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-gray-500">Overall Booking Rate</div>
              <div className="text-lg font-semibold">
                {formatPercent(snapshot.globalStats?.overallBookingRate)}
              </div>
              <div className="text-sm text-gray-500">
                {snapshot.globalStats?.totalBookedSlots ?? 0} / {snapshot.globalStats?.totalUniverseSlots ?? 0}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-gray-500">Locations With Universe</div>
              <div className="text-lg font-semibold">
                {snapshot.globalStats?.locationsWithUniverse ?? 0}
              </div>
              <div className="text-sm text-gray-500">
                out of {snapshot.globalStats?.locationCount ?? 0}
              </div>
            </div>
          </div>

          <div className="card p-6 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Location Ranking</h2>
                <p className="text-gray-500">Sorted from the saved localhost snapshot.</p>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search location..."
                  className="input-box"
                />
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value)}
                  className="input-box"
                >
                  <option value="bookingRate">Booking Rate</option>
                  <option value="totalBookedSlots">Booked Slots</option>
                  <option value="totalUniverseSlots">Universe Slots</option>
                  <option value="totalAvailableSlots">Available Slots</option>
                  <option value="totalBlockedSlots">Blocked Slots</option>
                  <option value="daysWithUniverse">Days With Universe</option>
                  <option value="locationName">Location Name</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Location</th>
                    <th>Booking Rate</th>
                    <th>Booked</th>
                    <th>Universe</th>
                    <th>Available</th>
                    <th>Blocked</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingRows.map((row, index) => (
                    <tr
                      key={row.locationId}
                      className={`cursor-pointer ${selectedLocationId === row.locationId ? 'bg-blue-100' : ''}`}
                      onClick={() => setSelectedLocationId(row.locationId)}
                    >
                      <td>{index + 1}</td>
                      <td>{row.locationName}</td>
                      <td>{formatPercent(row.bookingRate)}</td>
                      <td>{row.totalBookedSlots}</td>
                      <td>{row.totalUniverseSlots}</td>
                      <td>{row.totalAvailableSlots}</td>
                      <td>{row.totalBlockedSlots}</td>
                      <td>{row.daysWithUniverse} / {row.daysTracked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {selectedAggregate && (
            <div className="card p-6 space-y-4">
              <div>
                <h2 className="text-2xl font-semibold">{selectedAggregate.locationName}</h2>
                <p className="text-gray-500">
                  {formatPercent(selectedAggregate.bookingRate)} booking rate, {selectedAggregate.totalBookedSlots} booked from {selectedAggregate.totalUniverseSlots} universe slots.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Booking Rate</th>
                      <th>Booked</th>
                      <th>Universe</th>
                      <th>Available</th>
                      <th>Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateRows.map((row) => (
                      <tr key={row.dateKey}>
                        <td>{row.dateKey}</td>
                        <td>{formatPercent(row.bookingRate)}</td>
                        <td>{row.bookedSlotCount}</td>
                        <td>{row.slotCount}</td>
                        <td>{row.availableSlotCount}</td>
                        <td>{row.blockedSlotCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

InsightsPage.displayName = 'InsightsPage';

export default InsightsPage;
