import { fail } from 'k6';

import { requireField, requireJson } from '../lib/checks.js';
import { authHeaders, requestWithExpectedStatuses } from '../lib/http.js';

export function createReservation(config, trace, token, target) {
  const response = requestWithExpectedStatuses(
    config,
    trace,
    'reservation.create',
    'POST',
    '/reservations',
    {
      concertId: target.concertId,
      showtimeId: target.showtimeId,
      performanceId: target.performanceId,
      seatId: target.seatId,
    },
    authHeaders(token),
    {},
    [201, 409],
  );
  if (response.status === 409) {
    return null;
  }
  const body = requireJson(response, 'reservation.create');
  requireField(body, 'id', 'reservation.create');
  return body;
}

export function createReservationWithSeatRetry(config, trace, token, selectTarget) {
  for (let attempt = 0; attempt < config.maxSeatAttempts; attempt += 1) {
    const target = selectTarget(attempt);
    const reservation = createReservation(config, trace, token, target);
    if (reservation) {
      return { target, reservation };
    }
  }
  fail(`reservation.create exhausted ${config.maxSeatAttempts} seat attempts`);
  return null;
}
