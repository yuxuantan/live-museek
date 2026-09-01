'use client';

import { useEffect, useMemo, useState } from 'react';
import { isLocalhostHostname } from '../../../refreshAccess';
import {
  addDaysToScheduleDate,
  downloadScheduleStory,
  getNextWeekScheduleRange,
  selectSchedulePerformances,
  validateScheduleRange,
} from '../../../scheduleStory';

export default function ScheduleStoryGenerator({ busker, performances, imageUrls }) {
  const defaultRange = useMemo(() => getNextWeekScheduleRange(), []);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [fromDate, setFromDate] = useState(defaultRange.fromDate);
  const [toDate, setToDate] = useState(defaultRange.toDate);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setIsLocalhost(isLocalhostHostname(window.location.hostname));
  }, []);

  const validation = useMemo(
    () => validateScheduleRange(fromDate, toDate),
    [fromDate, toDate]
  );
  const selectedPerformances = useMemo(
    () => validation.valid
      ? selectSchedulePerformances(performances, fromDate, toDate)
      : [],
    [performances, fromDate, toDate, validation.valid]
  );

  if (!isLocalhost) return null;

  const handleGenerate = async () => {
    setMessage('');
    setIsGenerating(true);
    try {
      const result = await downloadScheduleStory({
        busker,
        performances,
        fromDate,
        toDate,
        imageUrls,
      });
      setMessage(`Downloaded ${result.filename}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not generate the schedule image.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateDisabled =
    !busker ||
    !validation.valid ||
    selectedPerformances.length === 0 ||
    isGenerating;

  return (
    <section className="card mb-6 overflow-hidden border border-fuchsia-200 bg-base-100 shadow-xl">
      <div className="card-body gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold">Instagram Story Schedule</h2>
              <span className="badge badge-secondary badge-outline">Localhost only</span>
            </div>
            <p className="max-w-2xl text-sm text-base-content/70 sm:text-base">
              Create a polished 1080 × 1920 PNG with this musician&apos;s dates, times, and venues.
              It defaults to next Monday through Sunday and is ready to post as a Story.
            </p>
          </div>
          <div className="hidden rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-600 px-5 py-3 text-right text-white sm:block">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">Output</p>
            <p className="text-lg font-black">9:16 PNG</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <label className="form-control w-full">
            <span className="label-text mb-2 font-semibold">From date</span>
            <input
              type="date"
              className="input input-bordered w-full"
              value={fromDate}
              onChange={(event) => {
                const nextFromDate = event.target.value;
                setFromDate(nextFromDate);
                if (nextFromDate && (!toDate || toDate < nextFromDate)) {
                  setToDate(addDaysToScheduleDate(nextFromDate, 6));
                }
                setMessage('');
              }}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text mb-2 font-semibold">To date</span>
            <input
              type="date"
              className="input input-bordered w-full"
              value={toDate}
              min={fromDate || undefined}
              max={fromDate ? addDaysToScheduleDate(fromDate, 6) : undefined}
              onChange={(event) => {
                setToDate(event.target.value);
                setMessage('');
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary min-w-44"
            onClick={handleGenerate}
            disabled={generateDisabled}
          >
            {isGenerating ? (
              <>
                <span className="loading loading-spinner loading-sm" aria-hidden />
                Generating…
              </>
            ) : (
              'Generate & download'
            )}
          </button>
        </div>

        <div className="rounded-xl bg-base-200/60 px-4 py-3 text-sm text-base-content/75" aria-live="polite">
          {!validation.valid ? (
            <p className="text-error">{validation.message}</p>
          ) : selectedPerformances.length === 0 ? (
            <p>No upcoming performances are loaded in this range. Choose dates that include a listed event.</p>
          ) : (
            <p>
              Ready to include <strong>{selectedPerformances.length}</strong>{' '}
              {selectedPerformances.length === 1 ? 'performance' : 'performances'} across{' '}
              <strong>{validation.dayCount}</strong> {validation.dayCount === 1 ? 'day' : 'days'}.
            </p>
          )}
          {message ? (
            <p className={`mt-1 ${message.startsWith('Downloaded') ? 'text-success' : 'text-error'}`}>
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
