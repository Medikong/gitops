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

export function checkCatalog(config, trace) {
  const response = request(config, trace, 'catalog.concerts', 'GET', '/concerts', null, {}, { limit: 50 });
  return itemsFrom(requireJson(response, 'catalog.concerts'));
}

export function selectSyntheticSeat(config, trace, offset = 0) {
  const concerts = checkCatalog(config, trace);
  const concert = pickConcert(config, concerts);
  const concertId = requireField(concert, 'id', 'catalog.concerts');

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
  const performance = pickByRunId(performances, config.runId, offset);
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
