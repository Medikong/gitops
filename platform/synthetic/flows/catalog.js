import { fail } from 'k6';

import { requireField, requireJson } from '../lib/checks.js';
import { request } from '../lib/http.js';
import { availableSeats, pickByRunId } from '../lib/seat-selection.js';

function itemsFrom(body) {
  if (Array.isArray(body)) {
    return body;
  }
  return body.items || [];
}

function pickConcert(config, concerts) {
  const candidates = config.concertTitle
    ? concerts.filter((concert) => concert.title === config.concertTitle)
    : concerts;
  if (config.concertId) {
    const found = candidates.find((concert) => concert.id === config.concertId);
    if (!found) {
      fail(`configured SYNTHETIC_CONCERT_ID was not found: ${config.concertId}`);
    }
    return found;
  }
  if (candidates.length === 0) {
    fail(`catalog.concerts returned no synthetic concert titled ${config.concertTitle}; run fixture setup before full journey`);
  }
  return pickByRunId(candidates, config.runId);
}

function fixtureConcertId(fixture) {
  return fixture && fixture.concert && fixture.concert.id ? String(fixture.concert.id) : '';
}

function fixtureShowtimeId(fixture) {
  return fixture && fixture.showtime && fixture.showtime.id ? String(fixture.showtime.id) : '';
}

function pickPerformance(config, performances, showtimeId, offset) {
  if (showtimeId) {
    const found = performances.find((performance) => String(performance.id) === showtimeId);
    if (!found) {
      fail(`catalog.performances did not include fixture showtime ${showtimeId}`);
    }
    return found;
  }
  return pickByRunId(performances, config.runId, offset);
}

export function checkCatalog(config, trace) {
  const response = request(config, trace, 'catalog.concerts', 'GET', '/concerts', null, {}, { limit: 50 });
  return itemsFrom(requireJson(response, 'catalog.concerts'));
}

export function selectSyntheticSeat(config, trace, offset = 0, fixture = null) {
  const concertId = fixtureConcertId(fixture) || config.concertId || requireField(
    pickConcert(config, checkCatalog(config, trace)),
    'id',
    'catalog.concerts',
  );
  const showtimeId = fixtureShowtimeId(fixture);

  const performanceResponse = request(
    config,
    trace,
    'catalog.performances',
    'GET',
    `/concerts/${encodeURIComponent(concertId)}/performances`,
    null,
    {},
    { limit: 50 },
  );
  const performances = itemsFrom(requireJson(performanceResponse, 'catalog.performances'));
  if (performances.length === 0) {
    fail(`catalog.performances returned no performances for concert ${concertId}`);
  }
  const performance = pickPerformance(config, performances, showtimeId, offset);
  const performanceId = requireField(performance, 'id', 'catalog.performances');

  const seatResponse = request(
    config,
    trace,
    'catalog.seats',
    'GET',
    `/performances/${encodeURIComponent(performanceId)}/seats`,
    null,
    {},
    { limit: 200 },
  );
  const seats = availableSeats(itemsFrom(requireJson(seatResponse, 'catalog.seats')));
  if (seats.length === 0) {
    fail(`catalog.seats returned no available seats for performance ${performanceId}`);
  }
  const seat = pickByRunId(seats, config.runId, offset);

  return {
    concertId,
    performanceId,
    showtimeId: performanceId,
    seatId: requireField(seat, 'id', 'catalog.seats'),
  };
}
