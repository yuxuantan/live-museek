'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../supabaseClient';
import { mergeBackToBackPerformances } from '../../../utils';

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

    return String(a.busker_name ?? '').localeCompare(String(b.busker_name ?? ''));
};

const LocationDetailPage = ({ params }) => {
    const [performances, setPerformances] = useState([]);
    const [location, setLocation] = useState(null);
    const [eventsView, setEventsView] = useState('calendar');
    const [selectedDate, setSelectedDate] = useState('');
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    // Get current epoch time to avoid image caching issues
    const currentEpochTime = Math.floor(new Date().getTime() / 1000);
    const storagePublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;
    const todayDateKey = toDateKey(new Date());

    useEffect(() => {
        const fetchPerformances = async () => {
            const { data: performanceData, error: performanceError } = await supabase.from('performances').select('*').eq('location_id', params.id);
            if (performanceError) {
                console.error('Error fetching performances:', performanceError);
            } else {
                const { data: buskersData, error: buskersError } = await supabase.from('buskers').select('*');
                if (buskersError) {
                    console.error('Error fetching buskers:', buskersError);
                } else {
                    // Set busker details in performance object
                    performanceData.forEach((performance) => {
                        const busker = buskersData.find(busker => busker.busker_id === performance.busker_id);
                        performance.busker_name = busker?.name;
                        performance.busker_act = busker?.act;
                        performance.busker_art_form = busker?.art_form;
                    });
                    // Remove duplicate timeslots and merge back-to-back performances at the same location
                    const mergedPerformances = mergeBackToBackPerformances(performanceData);
                    setPerformances(mergedPerformances);
                }
            }

            const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*').eq('location_id', params.id);
            if (locationsError) {
                console.error('Error fetching locations:', locationsError);
            } else {
                setLocation(locationsData[0]);
            }
        };

        fetchPerformances();
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

    // Function to format the date label
    const formatDateLabel = (dateString) => {
        const date = parseDateKey(dateString);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Check if the date is today, tomorrow, or a different day of the week
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Tmr';
        } else {
            // Return the day of the week (e.g., 'Monday')
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
        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    };

    const handleCalendarDateClick = (dateKey, inCurrentMonth) => {
        setSelectedDate(dateKey);
        if (!inCurrentMonth) {
            const clickedDate = parseDateKey(dateKey);
            setCalendarMonth(new Date(clickedDate.getFullYear(), clickedDate.getMonth(), 1));
        }
    };

    return (
        <div className="container mx-auto px-3 py-4 sm:p-6">
            <div className="card rounded-lg shadow-lg p-6 mb-6">
                <div className="grid grid-cols-1">
                    <h1 className="text-bold text-3xl">{location?.name}</h1>
                    <p className="text-gray-600">{location?.address}</p>
                    <img src={`${storagePublicBaseUrl}/location_images/${location?.location_id}.jpg?${currentEpochTime}`} alt={location ? location.name : ''} className="rounded-lg shadow-lg md:w-1/2 my-4" />
                    <p className="text-gray-600">{location?.description}</p>
                </div>
            </div>

            <div className="flex flex-col mb-6 md:space-x-6 space-y-6">
                <div className="card rounded-lg shadow-lg p-6">
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
                                                                    key={`${performance.event_id}-${performance.start_datetime}-${performance.busker_id}`}
                                                                    className="truncate rounded bg-primary/30 px-1 py-0.5 text-[10px] leading-tight text-base-content"
                                                                    title={`${toTimeLabel(performance.start_datetime)} - ${toTimeLabel(performance.end_datetime)} | ${performance.busker_name ?? 'Busker TBC'}`}
                                                                >
                                                                    {toTimeLabel(performance.start_datetime)} · {performance.busker_name ?? 'Busker TBC'}
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
                                                        <li key={`${performance.event_id}-${performance.start_datetime}-${performance.busker_id}`}>
                                                            <div className="p-4 bg-gray-100 rounded-lg shadow">
                                                                <p className="text-gray-700">Time: {toTimeLabel(performance.start_datetime)} - {toTimeLabel(performance.end_datetime)}</p>
                                                                <p className="text-gray-700">Busker: <a href={`/seek-buskers/${performance.busker_id}`} className="text-blue-500 hover:underline">{performance.busker_name}</a></p>
                                                                <p className="text-gray-700">Act: {performance.busker_act}</p>
                                                                <p className="text-gray-700">Art Form: {performance.busker_art_form}</p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-gray-600">No bookings on this day.</p>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div>
                                    {sortedPerformanceDates.map((date) => (
                                        <details key={date} className="mb-4">
                                            <summary className="cursor-pointer text-xl mb-2">
                                                {date} ({formatDateLabel(date)}) [{groupedPerformances[date].length}]
                                            </summary>
                                            <ul className="pl-4">
                                                {(sortedGroupedPerformances[date] || []).map((performance) => (
                                                    <li key={`${performance.event_id}-${performance.start_datetime}-${performance.busker_id}`} className="mb-4">
                                                        <div className="p-4 bg-gray-100 rounded-lg shadow">
                                                            <p className="text-gray-700">Time: {toTimeLabel(performance.start_datetime)} - {toTimeLabel(performance.end_datetime)}</p>
                                                            <p className="text-gray-700">Busker: <a href={`/seek-buskers/${performance.busker_id}`} className="text-blue-500 hover:underline">{performance.busker_name}</a></p>
                                                            <p className="text-gray-700">Act: {performance.busker_act}</p>
                                                            <p className="text-gray-700">Art Form: {performance.busker_art_form}</p>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <p className="text-gray-600">No upcoming performances found for this location.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

LocationDetailPage.displayName = 'LocationDetailPage';
export default LocationDetailPage;
