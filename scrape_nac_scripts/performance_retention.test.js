import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countHistoricalPerformances,
  filterCurrentOrFuturePerformances,
  isCurrentOrFuturePerformance,
  normalizeRefreshCutoff,
} from './performance_retention.js';

const cutoff = new Date('2026-08-17T12:00:00.000Z');
const performances = [
  { id: 'ended', end_datetime: '2026-08-17T11:59:59.999Z' },
  { id: 'ending-now', end_datetime: '2026-08-17T12:00:00.000Z' },
  { id: 'future', end_datetime: '2026-08-17T14:00:00.000Z' },
  { id: 'invalid', end_datetime: 'not-a-date' },
];

test('keeps ended performances out of the refreshable set', () => {
  assert.deepEqual(
    filterCurrentOrFuturePerformances(performances, cutoff).map((performance) => performance.id),
    ['ending-now', 'future']
  );
  assert.equal(countHistoricalPerformances(performances, cutoff), 1);
});

test('treats a performance ending at the cutoff as refreshable', () => {
  assert.equal(
    isCurrentOrFuturePerformance({ end_datetime: cutoff.toISOString() }, cutoff),
    true
  );
});

test('rejects invalid refresh cutoffs', () => {
  assert.throws(() => normalizeRefreshCutoff('not-a-date'), /valid date/);
});
