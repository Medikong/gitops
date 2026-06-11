export function hashRunId(runId) {
  let hash = 0;
  for (let i = 0; i < runId.length; i += 1) {
    hash = (hash * 31 + runId.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickByRunId(items, runId, offset = 0) {
  if (!items || items.length === 0) {
    throw new Error('no candidate items');
  }
  return items[(hashRunId(runId) + offset) % items.length];
}

export function availableSeats(items) {
  return (items || []).filter((seat) => String(seat.status || '').toLowerCase() === 'available');
}
