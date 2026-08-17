export function normalizeRefreshCutoff(cutoff = new Date()) {
  const normalizedCutoff = cutoff instanceof Date ? cutoff : new Date(cutoff);
  if (Number.isNaN(normalizedCutoff.getTime())) {
    throw new Error('Performance refresh cutoff must be a valid date.');
  }

  return normalizedCutoff;
}

export function isCurrentOrFuturePerformance(performance, cutoff = new Date()) {
  const normalizedCutoff = normalizeRefreshCutoff(cutoff);
  const endTime = new Date(performance?.end_datetime).getTime();

  return Number.isFinite(endTime) && endTime >= normalizedCutoff.getTime();
}

export function filterCurrentOrFuturePerformances(performances, cutoff = new Date()) {
  const normalizedCutoff = normalizeRefreshCutoff(cutoff);

  return (performances ?? []).filter((performance) =>
    isCurrentOrFuturePerformance(performance, normalizedCutoff)
  );
}

export function countHistoricalPerformances(performances, cutoff = new Date()) {
  const normalizedCutoff = normalizeRefreshCutoff(cutoff);

  return (performances ?? []).filter((performance) => {
    const endTime = new Date(performance?.end_datetime).getTime();
    return Number.isFinite(endTime) && endTime < normalizedCutoff.getTime();
  }).length;
}
