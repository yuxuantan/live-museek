'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { mergeBackToBackPerformances } from '../../../utils';
import { QRCodeSVG } from 'qrcode.react';
import {
  getBuskerRefreshCooldownKey,
  getRefreshCooldownRemainingMs,
  setRefreshCooldown,
  REFRESH_BUTTON_COOLDOWN_MS,
} from '../../../refreshCooldown';

const toDateKey = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const buildCalendarCells = (monthDate) => {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const cells = [];
  const cursor = new Date(gridStart);

  while (cursor <= gridEnd) {
    const cellDate = new Date(cursor);
    cells.push({
      dateKey: toDateKey(cellDate),
      inCurrentMonth: cellDate.getMonth() === monthDate.getMonth(),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return cells;
};

const toTimeLabel = (value) => String(value ?? '').substring(11, 16);

const toMinutesFromDateTime = (value) => {
  const timeLabel = toTimeLabel(value);
  if (/^\d{2}:\d{2}$/.test(timeLabel)) {
    const [hours, minutes] = timeLabel.split(':').map(Number);
    return (hours * 60) + minutes;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return (parsed.getHours() * 60) + parsed.getMinutes();
  }

  return Number.MAX_SAFE_INTEGER;
};

const comparePerformancesByStartTime = (a, b) => {
  const startDiff = toMinutesFromDateTime(a.start_datetime) - toMinutesFromDateTime(b.start_datetime);
  if (startDiff !== 0) return startDiff;

  const endDiff = toMinutesFromDateTime(a.end_datetime) - toMinutesFromDateTime(b.end_datetime);
  if (endDiff !== 0) return endDiff;

  return String(a.location_name ?? '').localeCompare(String(b.location_name ?? ''));
};

export default function BuskerDetailPage({ params }) {
  const [performances, setPerformances] = useState([]);
  const [busker, setBusker] = useState(null);
  const [showQR, setShowQR] = useState(false);
  const [eventsView, setEventsView] = useState('calendar');
  const [selectedDate, setSelectedDate] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [refreshCooldownRemainingMs, setRefreshCooldownRemainingMs] = useState(0);

  const currentEpochTime = Math.floor(new Date().getTime() / 1000);
  const qrCodeUrl = `livemuseek.com/seek-buskers/${params.id}`;
  const storagePublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;
  const todayDateKey = toDateKey(new Date());
  const refreshCooldownKey = getBuskerRefreshCooldownKey(params.id);

  useEffect(() => {
    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching performances:', error);
      } else {
        const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*');
        if (locationsError) {
          console.error('Error fetching locations:', locationsError);
        } else {
          const performancesWithLocations = data.map((performance) => ({
            ...performance,
            location_name: locationsData.find(location => location.location_id === performance.location_id)?.name,
            location_address: locationsData.find(location => location.location_id === performance.location_id)?.address,
          }));
          const mergedPerformances = mergeBackToBackPerformances(performancesWithLocations);
          setPerformances(mergedPerformances);
        }
      }
    };

    const fetchBusker = async () => {
      const { data, error } = await supabase.from('buskers').select('*').eq('busker_id', params.id).single();
      if (error) {
        console.error('Error fetching busker:', error);
      } else {
        setBusker(data);
      }
    };

    fetchPerformances();
    fetchBusker();
  }, [params.id]);

  useEffect(() => {
    const syncCooldown = () => {
      setRefreshCooldownRemainingMs(getRefreshCooldownRemainingMs(refreshCooldownKey));
    };

    syncCooldown();
    const intervalId = window.setInterval(syncCooldown, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshCooldownKey]);

  const groupedPerformances = useMemo(
    () => performances.reduce((acc, performance) => {
      const date = toDateKey(performance.start_datetime);
      if (!acc[date]) acc[date] = [];
      acc[date].push(performance);
      return acc;
    }, {}),
    [performances]
  );

  const sortedPerformanceDates = useMemo(
    () => Object.keys(groupedPerformances).sort(),
    [groupedPerformances]
  );

  const sortedGroupedPerformances = useMemo(
    () => Object.entries(groupedPerformances).reduce((acc, [date, dayPerformances]) => {
      acc[date] = [...dayPerformances].sort(comparePerformancesByStartTime);
      return acc;
    }, {}),
    [groupedPerformances]
  );

  useEffect(() => {
    if (sortedPerformanceDates.length === 0) {
      setSelectedDate('');
      return;
    }

    const firstUpcomingDate =
      sortedPerformanceDates.find((date) => date >= todayDateKey) || sortedPerformanceDates[0];

    setSelectedDate(firstUpcomingDate);

    const focusDate = parseDateKey(firstUpcomingDate);
    setCalendarMonth(new Date(focusDate.getFullYear(), focusDate.getMonth(), 1));
  }, [sortedPerformanceDates, todayDateKey]);

  const formatDateLabel = (dateString) => {
    const date = parseDateKey(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tmr';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
  };

  const formatDateHeadline = (dateString) => parseDateKey(dateString).toLocaleDateString(
    'en-US',
    { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  );

  const calendarCells = useMemo(() => {
    return buildCalendarCells(calendarMonth);
  }, [calendarMonth]);

  const selectedDatePerformances = useMemo(() => {
    if (!selectedDate || !sortedGroupedPerformances[selectedDate]) return [];
    return sortedGroupedPerformances[selectedDate];
  }, [selectedDate, sortedGroupedPerformances]);

  const goToPreviousMonth = () => {
    setCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
    );
  };

  const goToNextMonth = () => {
    setCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
    );
  };

  const handleCalendarDateClick = (dateKey, inCurrentMonth) => {
    setSelectedDate(dateKey);
    if (!inCurrentMonth) {
      const clickedDate = parseDateKey(dateKey);
      setCalendarMonth(new Date(clickedDate.getFullYear(), clickedDate.getMonth(), 1));
    }
  };

  const handleRefreshClick = () => {
    if (refreshCooldownRemainingMs > 0) {
      return;
    }

    setRefreshCooldown(refreshCooldownKey, REFRESH_BUTTON_COOLDOWN_MS);
    setRefreshCooldownRemainingMs(REFRESH_BUTTON_COOLDOWN_MS);
    window.location.assign(`/seek-buskers/${params.id}/refresh`);
  };

  return (
    <div className="container mx-auto px-3 py-4 sm:p-6">
      <div className="card bg-base-100 shadow-xl mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative">
              <img
                src={`${storagePublicBaseUrl}/busker_custom_images/${busker?.busker_id}.jpg?${currentEpochTime}`}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `${storagePublicBaseUrl}/busker_images/${busker?.busker_id}.jpg?${currentEpochTime}`;
                }}
                className="w-full aspect-square object-cover object-center rounded-full"
                alt={busker?.name}
              />
              <button
                className="btn btn-primary btn-sm absolute bottom-0 right-0 m-2"
                onClick={() => setShowQR(!showQR)}
              >
                {showQR ? 'Hide QR' : 'Generate Sharing QR'}
              </button>
            </div>
            <div className="self-center col-span-2">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold mb-4">{busker?.name}</h1>
                  <p className="text-lg md:text-xl text-base-content mb-4">{busker?.act}</p>
                  <p className="text-lg md:text-xl text-base-content mb-4">{busker?.art_form}</p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  <a
                    href={`/api/seek-buskers/${params.id}/calendar`}
                    className="btn btn-outline btn-sm w-full sm:w-auto"
                  >
                    Import to Google Calendar (.ics)
                  </a>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm w-full sm:w-auto"
                    onClick={handleRefreshClick}
                    disabled={refreshCooldownRemainingMs > 0}
                  >
                    {refreshCooldownRemainingMs > 0
                      ? `Refresh in ${Math.ceil(refreshCooldownRemainingMs / 1000)}s`
                      : 'Refresh from NAC'}
                  </button>
                </div>
              </div>
              {showQR && (
                <div className="mt-4">
                  <QRCodeSVG value={qrCodeUrl} size={128} />
                  <p className="mt-2 text-sm text-base-content/70">Scan to get link to current page</p>
                </div>
              )}
            </div>
          </div>
          {busker?.custom_profile?.custom_bio || busker?.bio?.trim() ? (
            <p className="text-base-content/80 mt-6">{busker?.custom_profile?.custom_bio ?? busker?.bio.trim()}</p>
          ) : null}
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
          {sortedPerformanceDates.length > 0 ? (
            <>
              <div className="tabs tabs-boxed mb-4 w-full sm:w-fit">
                <button
                  type="button"
                  className={`tab flex-1 sm:flex-none ${eventsView === 'calendar' ? 'tab-active' : ''}`}
                  onClick={() => setEventsView('calendar')}
                >
                  Calendar View
                </button>
                <button
                  type="button"
                  className={`tab flex-1 sm:flex-none ${eventsView === 'list' ? 'tab-active' : ''}`}
                  onClick={() => setEventsView('list')}
                >
                  List View
                </button>
              </div>

              {eventsView === 'calendar' ? (
                <div className="space-y-5">
                  <div className="sticky top-2 z-20 rounded-xl border border-base-300 bg-base-100/95 p-2 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="btn btn-xs sm:btn-sm btn-outline h-8 min-h-0 w-8 p-0 sm:h-auto sm:w-auto sm:px-3"
                        onClick={goToPreviousMonth}
                        aria-label="Previous month"
                      >
                        <span className="text-base leading-none" aria-hidden>‹</span>
                      </button>
                      <h3 className="text-base sm:text-lg font-semibold tracking-tight">
                        {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </h3>
                      <button
                        type="button"
                        className="btn btn-xs sm:btn-sm btn-outline h-8 min-h-0 w-8 p-0 sm:h-auto sm:w-auto sm:px-3"
                        onClick={goToNextMonth}
                        aria-label="Next month"
                      >
                        <span className="text-base leading-none" aria-hidden>›</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-base-300 overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-base-300 bg-base-200/40">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                        <div
                          key={`${day}-${index}`}
                          className="py-2 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-base-content/75"
                        >
                          {day}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 divide-x divide-y divide-base-300">
                      {calendarCells.map((cell) => {
                        const { dateKey, inCurrentMonth } = cell;
                        const date = dateKey;
                        const dayEvents = sortedGroupedPerformances[date] || [];
                        const isSelected = date === selectedDate;
                        const isToday = date === todayDateKey;
                        const dayNumber = parseDateKey(date).getDate();
                        const dayNumberStyle = isSelected
                          ? 'bg-primary text-primary-content'
                          : isToday
                            ? 'ring-1 ring-primary text-primary'
                            : inCurrentMonth
                              ? 'text-base-content/85'
                              : 'text-base-content/35';

                        return (
                          <button
                            key={dateKey}
                            type="button"
                            className={`min-h-[72px] sm:min-h-[108px] p-1 sm:p-2 text-left align-top transition ${
                              isSelected
                                ? 'bg-primary/12'
                                : inCurrentMonth
                                  ? 'bg-base-100 hover:bg-base-200/30'
                                  : 'bg-base-200/35 hover:bg-base-200/55'
                            }`}
                            onClick={() => handleCalendarDateClick(date, inCurrentMonth)}
                            aria-label={`View events on ${date}`}
                          >
                            <span
                              className={`inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[11px] sm:text-xs font-semibold ${dayNumberStyle}`}
                            >
                              {dayNumber}
                            </span>

                            <div className="mt-1 space-y-0.5 sm:space-y-1 max-h-11 sm:max-h-[74px] overflow-y-auto pr-0.5">
                              {dayEvents.map((performance) => (
                                <p
                                  key={`${performance.event_id}-${performance.start_datetime}-${performance.location_id}`}
                                  className="truncate rounded bg-primary/30 px-1 py-0.5 text-[10px] leading-tight text-base-content"
                                  title={`${toTimeLabel(performance.start_datetime)} - ${toTimeLabel(performance.end_datetime)} | ${performance.location_name ?? 'Location TBC'}`}
                                >
                                  {toTimeLabel(performance.start_datetime)} · {performance.location_name ?? 'Location TBC'}
                                </p>
                              ))}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedDate ? (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-sm sm:text-base font-semibold text-base-content">
                          {formatDateHeadline(selectedDate)} ({formatDateLabel(selectedDate)})
                        </h4>
                        <span className="badge badge-primary badge-outline">
                          {selectedDatePerformances.length}
                        </span>
                      </div>
                      {selectedDatePerformances.length > 0 ? (
                        <ul className="space-y-4">
                          {selectedDatePerformances.map((performance) => (
                            <li key={`${performance.event_id}-${performance.start_datetime}`}>
                              <div className="card bg-base-100 shadow-sm border border-base-300">
                                <div className="card-body p-4">
                                  <p className="text-gray-700">
                                    Time: {toTimeLabel(performance.start_datetime)} - {toTimeLabel(performance.end_datetime)}
                                  </p>
                                  <p className="text-base-content">
                                    Location:{' '}
                                    <a href={`/seek-locations/${performance.location_id}`} className="link link-primary">
                                      {performance.location_name}
                                    </a>
                                  </p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-base-content/70">No bookings on this day.</p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedPerformanceDates.map((date) => (
                    <div key={date} className="collapse collapse-arrow bg-gray-200">
                      <input type="checkbox" />
                      <div className="collapse-title text-xl font-medium">
                        {date} ({formatDateLabel(date)}) [{groupedPerformances[date].length}]
                      </div>
                      <div className="collapse-content">
                        <ul className="space-y-4">
                          {(sortedGroupedPerformances[date] || [])
                            .map((performance) => (
                              <li key={`${performance.event_id}-${performance.start_datetime}`}>
                                <div className="card bg-base-100 shadow-sm">
                                  <div className="card-body p-4">
                                    <p className="text-gray-700">
                                      Time: {toTimeLabel(performance.start_datetime)} - {toTimeLabel(performance.end_datetime)}
                                    </p>
                                    <p className="text-base-content">
                                      Location:{' '}
                                      <a href={`/seek-locations/${performance.location_id}`} className="link link-primary">
                                        {performance.location_name}
                                      </a>
                                    </p>
                                  </div>
                                </div>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-base-content/70">No upcoming performances found for this busker.</p>
          )}
        </div>
      </div>
    </div>
  );
}
