import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatScheduleTimeRange,
  getNextWeekScheduleRange,
  groupSchedulePerformances,
  selectSchedulePerformances,
  validateScheduleRange,
} from './scheduleStory.js';

test('defaults to the next Monday-through-Sunday calendar week', () => {
  assert.deepEqual(
    getNextWeekScheduleRange(new Date(2026, 8, 1, 12)),
    { fromDate: '2026-09-07', toDate: '2026-09-13' }
  );
  assert.deepEqual(
    getNextWeekScheduleRange(new Date(2026, 8, 7, 12)),
    { fromDate: '2026-09-14', toDate: '2026-09-20' }
  );
});

test('accepts a seven-day story range and rejects invalid or longer ranges', () => {
  assert.deepEqual(
    validateScheduleRange('2026-09-07', '2026-09-13'),
    { valid: true, dayCount: 7, message: '' }
  );
  assert.equal(validateScheduleRange('2026-09-13', '2026-09-07').valid, false);
  assert.equal(validateScheduleRange('2026-09-07', '2026-09-14').valid, false);
  assert.equal(validateScheduleRange('not-a-date', '2026-09-13').valid, false);
});

test('selects the inclusive range, sorts it, and groups performances by day', () => {
  const performances = [
    {
      event_id: 'late',
      start_datetime: '2026-09-08T20:00:00',
      end_datetime: '2026-09-08T21:00:00',
    },
    {
      event_id: 'outside',
      start_datetime: '2026-09-14T18:00:00',
      end_datetime: '2026-09-14T19:00:00',
    },
    {
      event_id: 'early',
      start_datetime: '2026-09-08T18:00:00',
      end_datetime: '2026-09-08T19:00:00',
    },
    {
      event_id: 'first-day',
      start_datetime: '2026-09-07T19:00:00',
      end_datetime: '2026-09-07T20:00:00',
    },
  ];

  const selected = selectSchedulePerformances(performances, '2026-09-07', '2026-09-13');
  assert.deepEqual(selected.map(({ event_id }) => event_id), ['first-day', 'early', 'late']);
  assert.deepEqual(
    groupSchedulePerformances(selected).map((group) => [
      group.dateKey,
      group.performances.map(({ event_id }) => event_id),
    ]),
    [
      ['2026-09-07', ['first-day']],
      ['2026-09-08', ['early', 'late']],
    ]
  );
});

test('formats compact 12-hour story times', () => {
  assert.equal(
    formatScheduleTimeRange('2026-09-07T18:00:00', '2026-09-07T20:30:00'),
    '6–8:30 PM'
  );
  assert.equal(
    formatScheduleTimeRange('2026-09-07T11:00:00', '2026-09-07T13:00:00'),
    '11 AM–1 PM'
  );
});
