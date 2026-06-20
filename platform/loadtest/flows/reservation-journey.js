import { fail, sleep } from 'k6';

import { authHeaders, getJson, requestJson, requestObservedStatuses, requestWithExpectedStatuses } from '../lib/http.js';
import { itemsFrom, requireField } from '../lib/pick.js';

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickByRunId(items, step, runId, offset = 0) {
  if (!items || items.length === 0) {
    fail(`${step} returned no candidate items`);
  }
  return items[(hashString(runId) + offset) % items.length];
}

function arrayFieldFrom(body, field, step) {
  const values = body && body[field];
  if (!Array.isArray(values)) {
    fail(`${step} response did not contain a ${field} array`);
  }
  return values;
}

function valueFrom(item, fields, step) {
  for (const field of fields) {
    if (item && item[field] !== undefined && item[field] !== null && item[field] !== '') {
      return item[field];
    }
  }
  fail(`${step} response item did not contain any of ${fields.join(', ')}`);
  return null;
}

function availableSeats(items) {
  return (items || []).filter((seat) => String(seat.status || '').toLowerCase() === 'available');
}

function stepName(config, suffix) {
  return `${config.stepPrefix || 'reservation_journey'}.${suffix}`;
}

function datasetConcerts(config, concerts, step = stepName(config, 'concerts')) {
  const expectedPrefix = `${config.dataset.titlePrefix} ${config.dataset.profile} ${config.dataset.revision} `;
  const candidates = concerts.filter((concert) => String(concert.title || '').startsWith(expectedPrefix));
  if (candidates.length === 0) {
    fail(`${step} returned no dataset concerts with prefix ${expectedPrefix}`);
  }
  return candidates;
}

function isoDateDaysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function calendarYearMonth(config) {
  if (config.calendarYearMonth) {
    return config.calendarYearMonth;
  }
  if (config.performanceDate) {
    return String(config.performanceDate).slice(0, 7);
  }
  return isoDateDaysFromNow(config.dataset.lookaheadDays).slice(0, 7);
}

function selectCalendarDate(config, calendarBody, step, attempt) {
  const days = arrayFieldFrom(calendarBody, 'days', step);
  if (config.performanceDate) {
    const targetDay = days.find((day) => day.date === config.performanceDate);
    if (!targetDay || targetDay.bookable !== true) {
      fail(`${step} did not mark ${config.performanceDate} as bookable`);
    }
    return config.performanceDate;
  }
  const bookableDays = days.filter((day) => day.bookable === true && day.date);
  return requireField(pickByRunId(bookableDays, step, `${config.iterationId || config.runId}:date`, attempt), 'date', step);
}

function selectLegacyReservationTarget(config, attempt) {
  const selectionId = config.iterationId || config.runId;
  const concertsStep = stepName(config, 'concerts');
  const performancesStep = stepName(config, 'performances');
  const seatsStep = stepName(config, 'seats');
  const concertsBody = getJson(config, concertsStep, '/concerts', { limit: config.concertLimit });
  const concerts = datasetConcerts(config, itemsFrom(concertsBody, concertsStep), concertsStep);
  const concert = pickByRunId(concerts, concertsStep, `${selectionId}:concert`, attempt);
  const concertId = requireField(concert, 'id', concertsStep);

  const performancesBody = getJson(
    config,
    performancesStep,
    `/concerts/${encodeURIComponent(concertId)}/performances`,
    { limit: config.performanceLimit },
  );
  const performances = itemsFrom(performancesBody, performancesStep);
  const performance = pickByRunId(performances, performancesStep, `${selectionId}:performance`, attempt);
  const performanceId = requireField(performance, 'id', performancesStep);

  const seatsBody = getJson(
    config,
    seatsStep,
    `/performances/${encodeURIComponent(performanceId)}/seats`,
    { limit: config.seatLimit },
  );
  const seats = availableSeats(itemsFrom(seatsBody, seatsStep));
  const seat = pickByRunId(seats, seatsStep, `${selectionId}:seat`, attempt);

  return {
    concertId,
    performanceId,
    showtimeId: performanceId,
    seatId: requireField(seat, 'id', seatsStep),
    seatCount: seats.length,
  };
}

export function selectReservationTarget(config, attempt = 0) {
  if (config.stepPrefix && config.stepPrefix !== 'reservation_journey') {
    return selectLegacyReservationTarget(config, attempt);
  }

  const selectionId = config.iterationId || config.runId;
  const recommendedStep = stepName(config, 'concert.recommended');
  const detailStep = stepName(config, 'concert.detail');
  const calendarStep = stepName(config, 'concert.calendar');
  const datePerformancesStep = stepName(config, 'concert.date_performances');
  const seatMapStep = stepName(config, 'concert.seat_map');
  const concertsBody = getJson(
    config,
    recommendedStep,
    '/concerts/recommended',
    { sort: 'latest', limit: config.concertLimit },
  );
  const concerts = datasetConcerts(config, itemsFrom(concertsBody, recommendedStep), recommendedStep);
  const concert = pickByRunId(concerts, recommendedStep, `${selectionId}:concert`, attempt);
  const concertId = valueFrom(concert, ['concertId', 'id'], recommendedStep);

  requestJson(config, detailStep, 'GET', `/concerts/${encodeURIComponent(concertId)}`);
  const calendarBody = getJson(
    config,
    calendarStep,
    `/concerts/${encodeURIComponent(concertId)}/calendar`,
    { yearMonth: calendarYearMonth(config) },
  );
  const performanceDate = selectCalendarDate(config, calendarBody, calendarStep, attempt);
  const performancesBody = getJson(
    config,
    datePerformancesStep,
    `/concerts/${encodeURIComponent(concertId)}/dates/${encodeURIComponent(performanceDate)}/performances`,
    { limit: config.performanceLimit },
  );
  const performances = arrayFieldFrom(performancesBody, 'performances', datePerformancesStep);
  const performance = pickByRunId(performances, datePerformancesStep, `${selectionId}:performance`, attempt);
  const performanceId = valueFrom(performance, ['performanceId', 'id'], datePerformancesStep);

  const seatsBody = getJson(
    config,
    seatMapStep,
    `/performances/${encodeURIComponent(performanceId)}/seat-map`,
    { limit: config.seatLimit },
  );
  const seats = availableSeats(arrayFieldFrom(seatsBody, 'seats', seatMapStep));
  const seat = pickByRunId(seats, seatMapStep, `${selectionId}:seat`, attempt);

  return {
    concertId,
    performanceId,
    showtimeId: performanceId,
    seatId: valueFrom(seat, ['seatId', 'id'], seatMapStep),
    seatCount: seats.length,
  };
}

export function selectSeatContentionTarget(config, attempt = 0) {
  const selectionId = config.runId || config.iterationId;
  const concertsStep = stepName(config, 'concerts');
  const performancesStep = stepName(config, 'performances');
  const seatsStep = stepName(config, 'seats');
  const concertsBody = getJson(config, concertsStep, '/concerts', { limit: config.concertLimit });
  const concerts = datasetConcerts(config, itemsFrom(concertsBody, concertsStep), concertsStep);
  const concert = pickByRunId(concerts, concertsStep, `${selectionId}:concert`, 0);
  const concertId = requireField(concert, 'id', concertsStep);

  const performancesBody = getJson(
    config,
    performancesStep,
    `/concerts/${encodeURIComponent(concertId)}/performances`,
    { limit: config.performanceLimit },
  );
  const performances = itemsFrom(performancesBody, performancesStep);
  const performance = pickByRunId(performances, performancesStep, `${selectionId}:performance`, 0);
  const performanceId = requireField(performance, 'id', performancesStep);

  const seatsBody = getJson(
    config,
    seatsStep,
    `/performances/${encodeURIComponent(performanceId)}/seats`,
    { limit: config.seatLimit },
  );
  const seats = itemsFrom(seatsBody, seatsStep);
  if (seats.length === 0) {
    fail(`${seatsStep} returned no candidate seats`);
  }
  const candidateCount = Math.min(config.seatCandidateCount || seats.length, seats.length);
  const seat = seats[(hashString(`${config.iterationId}:seat`) + attempt) % candidateCount];

  return {
    concertId,
    performanceId,
    showtimeId: performanceId,
    seatId: requireField(seat, 'id', seatsStep),
    seatCount: seats.length,
    seatCandidateCount: candidateCount,
  };
}

export function createReservationAttempt(config, token, target) {
  return requestObservedStatuses(
    config,
    stepName(config, 'reservation.create'),
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
}

function createReservation(config, token, target, onConflict) {
  const step = stepName(config, 'reservation.create');
  const response = createReservationAttempt(config, token, target);
  const isConflict = response.status === 409;
  onConflict(isConflict, response.status);
  if (isConflict) {
    return null;
  }
  if (response.status !== 201) {
    fail(`${step} failed with status ${response.status}`);
  }
  let body;
  try {
    body = response.json();
  } catch (error) {
    fail(`${step} returned invalid json: ${error.message}`);
  }
  requireField(body, 'id', step);
  return body;
}

export function createReservationWithSeatRetry(config, token, selectTarget, onConflict) {
  for (let attempt = 0; attempt < config.maxSeatAttempts; attempt += 1) {
    const target = selectTarget(attempt);
    const reservation = createReservation(config, token, target, onConflict);
    if (reservation) {
      return { target, reservation };
    }
  }
  fail(`reservation_journey.reservation.create exhausted ${config.maxSeatAttempts} seat attempts`);
  return null;
}

export function approvePayment(config, token, reservation, target) {
  const body = requestJson(
    config,
    'reservation_journey.payment.approve',
    'POST',
    '/payments',
    {
      reservationId: reservation.id,
      concertId: target.concertId,
      seatId: target.seatId,
      amount: config.paymentAmount,
      method: 'mock',
      simulation: 'approve',
    },
    {
      ...authHeaders(token),
      'Idempotency-Key': `${config.requestIdBase}-${reservation.id}`,
    },
  );
  requireField(body, 'id', 'reservation_journey.payment.approve');
  requireField(body, 'status', 'reservation_journey.payment.approve');
  return body;
}

function ticketMatches(ticket, reservation) {
  return String(ticket.reservationId) === String(reservation.id);
}

export function waitForTicket(config, token, reservation) {
  const deadline = Date.now() + config.pollSeconds * 1000;
  while (Date.now() <= deadline) {
    let cursor = null;
    for (let page = 0; page < config.ticketListMaxPages; page += 1) {
      const query = {
        limit: config.ticketListLimit,
        cursor,
      };
      const body = requestJson(
        config,
        'reservation_journey.ticket.list',
        'GET',
        '/tickets/me',
        null,
        authHeaders(token),
        query,
      );
      const items = itemsFrom(body, 'reservation_journey.ticket.list');
      const ticket = items.find((item) => ticketMatches(item, reservation));
      if (ticket) {
        return ticket;
      }
      cursor = body.nextCursor;
      if (!cursor) {
        break;
      }
    }
    sleep(config.pollIntervalSeconds);
  }
  fail(`reservation_journey.ticket.list did not return a ticket for reservation ${reservation.id}`);
  return null;
}
