'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { mergeBackToBackPerformances } from '../../../utils';
import { QRCodeSVG } from 'qrcode.react';

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
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

  const currentEpochTime = Math.floor(new Date().getTime() / 1000);
  const qrCodeUrl = `livemuseek.com/seek-buskers/${params.id}`;
  const storagePublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;
  const todayDateKey = toDateKey(new Date());

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

  const calendarCells = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const leadingEmptyCells = monthStart.getDay();
    const daysInMonth = monthEnd.getDate();

    const cells = [
      ...Array.from({ length: leadingEmptyCells }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1);
        return toDateKey(date);
      }),
    ];

    const trailingEmptyCells = (7 - (cells.length % 7)) % 7;
    return [...cells, ...Array.from({ length: trailingEmptyCells }, () => null)];
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

  return (
    <div className="container mx-auto p-6">
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
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{busker?.name}</h1>
              <p className="text-lg md:text-xl text-base-content mb-4">{busker?.act}</p>
              <p className="text-lg md:text-xl text-base-content mb-4">{busker?.art_form}</p>
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
              <div className="tabs tabs-boxed mb-4 w-fit">
                <button
                  type="button"
                  className={`tab ${eventsView === 'calendar' ? 'tab-active' : ''}`}
                  onClick={() => setEventsView('calendar')}
                >
                  Calendar View
                </button>
                <button
                  type="button"
                  className={`tab ${eventsView === 'list' ? 'tab-active' : ''}`}
                  onClick={() => setEventsView('list')}
                >
                  List View
                </button>
              </div>

              {eventsView === 'calendar' ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={goToPreviousMonth}
                    >
                      Prev
                    </button>
                    <h3 className="text-lg font-semibold">
                      {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h3>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={goToNextMonth}
                    >
                      Next
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-base-content/60">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day}>{day}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarCells.map((date, index) => {
                      if (!date) {
                        return <div key={`empty-${index}`} className="h-28 rounded-lg border border-transparent" />;
                      }

                      const dayEvents = sortedGroupedPerformances[date] || [];
                      const isSelected = date === selectedDate;
                      const isToday = date === todayDateKey;
                      const dayNumber = parseDateKey(date).getDate();

                      return (
                        <button
                          key={date}
                          type="button"
                          className={`h-28 rounded-lg border p-2 text-left transition ${
                            dayEvents.length > 0
                              ? 'border-primary/40 bg-primary/10 hover:bg-primary/20'
                              : 'border-base-300 bg-base-100 hover:border-base-content/30'
                          } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <div className="flex items-start justify-between">
                            <span className={`text-sm font-semibold ${isToday ? 'text-primary' : 'text-base-content'}`}>
                              {dayNumber}
                            </span>
                            {dayEvents.length > 0 ? (
                              <span className="badge badge-primary badge-sm">{dayEvents.length}</span>
                            ) : null}
                          </div>
                          {dayEvents.length > 0 ? (
                            <div className="mt-2 space-y-1 max-h-16 overflow-y-auto pr-1">
                              {dayEvents.map((performance) => (
                                <p
                                  key={`${performance.event_id}-${performance.start_datetime}-${performance.location_id}`}
                                  className="truncate text-[10px] leading-tight text-base-content/80"
                                  title={`${toTimeLabel(performance.start_datetime)} - ${toTimeLabel(performance.end_datetime)} | ${performance.location_name ?? 'Location TBC'}`}
                                >
                                  {toTimeLabel(performance.start_datetime)}-{toTimeLabel(performance.end_datetime)} {performance.location_name ?? 'Location TBC'}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-[10px] text-base-content/55">No bookings</p>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selectedDate ? (
                    <div className="pt-2">
                      <h4 className="text-lg font-medium mb-3">
                        {selectedDate} ({formatDateLabel(selectedDate)})
                      </h4>
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
