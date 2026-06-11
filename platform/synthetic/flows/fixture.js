import { fail } from 'k6';

import { requireField, requireJson } from '../lib/checks.js';
import { authHeaders, request, requestWithExpectedStatuses } from '../lib/http.js';

function isoDaysFromNow(days) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function buildSeatMap(config) {
  const rows = [];
  for (let row = 1; row <= config.fixtureSeatRows; row += 1) {
    const seatNumbers = [];
    for (let seat = 1; seat <= config.fixtureSeatsPerRow; seat += 1) {
      seatNumbers.push(String(seat));
    }
    rows.push({ name: String(row), seatNumbers });
  }
  return { sections: [{ name: 'SYN', rows }] };
}

function createVenue(config, trace, providerToken) {
  const totalSeats = config.fixtureSeatRows * config.fixtureSeatsPerRow;
  const response = request(
    config,
    trace,
    'fixture.venue.create',
    'POST',
    '/provider/venues',
    {
      name: `${config.concertTitle} Hall ${config.runId}`,
      address: 'Synthetic fixture',
      totalSeats,
    },
    authHeaders(providerToken),
  );
  return requireJson(response, 'fixture.venue.create');
}

function createConcert(config, trace, providerToken) {
  const response = request(
    config,
    trace,
    'fixture.concert.create',
    'POST',
    '/provider/concerts',
    {
      title: config.concertTitle,
      description: `Synthetic E2E fixture ${config.runId}`,
      ageRating: 'ALL',
      runningMinutes: 90,
    },
    authHeaders(providerToken),
  );
  return requireJson(response, 'fixture.concert.create');
}

function createShowtime(config, trace, providerToken, concert, venue) {
  const concertId = requireField(concert, 'id', 'fixture.concert.create');
  const venueId = requireField(venue, 'id', 'fixture.venue.create');
  const response = request(
    config,
    trace,
    'fixture.showtime.create',
    'POST',
    `/provider/concerts/${encodeURIComponent(concertId)}/showtimes`,
    {
      venueId,
      startsAt: isoDaysFromNow(config.fixtureLookaheadDays),
    },
    authHeaders(providerToken),
  );
  return requireJson(response, 'fixture.showtime.create');
}

function uploadSeatMap(config, trace, providerToken, showtime) {
  const showtimeId = requireField(showtime, 'id', 'fixture.showtime.create');
  requestWithExpectedStatuses(
    config,
    trace,
    'fixture.seat_map.upload',
    'POST',
    `/provider/showtimes/${encodeURIComponent(showtimeId)}/seat-map`,
    buildSeatMap(config),
    authHeaders(providerToken),
    {},
    [204],
  );
}

function approveSalePolicy(config, trace, providerToken, adminToken, concert) {
  const concertId = requireField(concert, 'id', 'fixture.concert.create');
  request(
    config,
    trace,
    'fixture.sale_policy.submit',
    'PUT',
    `/provider/concerts/${encodeURIComponent(concertId)}/sale-policy`,
    {
      presaleEnabled: false,
      fanclubVerificationRequired: false,
      maxTicketsPerUser: 4,
      refundPolicy: 'Synthetic fixture policy.',
    },
    authHeaders(providerToken),
  );
  request(
    config,
    trace,
    'fixture.sale_policy.approve',
    'POST',
    `/admin/concerts/${encodeURIComponent(concertId)}/sale-policy/approve`,
    {},
    authHeaders(adminToken),
  );
}

function openSales(config, trace, adminToken, concert) {
  const concertId = requireField(concert, 'id', 'fixture.concert.create');
  request(
    config,
    trace,
    'fixture.open_schedule.update',
    'PUT',
    `/admin/concerts/${encodeURIComponent(concertId)}/open-schedule`,
    {
      opensAt: isoDaysFromNow(-1),
      comment: 'Synthetic fixture open schedule.',
    },
    authHeaders(adminToken),
  );
  request(
    config,
    trace,
    'fixture.sales.start',
    'POST',
    `/admin/concerts/${encodeURIComponent(concertId)}/sales/start`,
    {},
    authHeaders(adminToken),
  );
}

function verifyPublicFixture(config, trace, concert, showtime) {
  const concertId = requireField(concert, 'id', 'fixture.concert.create');
  const showtimeId = requireField(showtime, 'id', 'fixture.showtime.create');
  const performanceBody = requireJson(request(
    config,
    trace,
    'fixture.performances.verify',
    'GET',
    `/concerts/${encodeURIComponent(concertId)}/performances`,
    null,
    {},
    { limit: 50 },
  ), 'fixture.performances.verify');
  const performances = Array.isArray(performanceBody) ? performanceBody : performanceBody.items || [];
  if (performances.length === 0) {
    fail(`fixture.performances.verify returned no performances for concert ${concertId}`);
  }
  const seatBody = requireJson(request(
    config,
    trace,
    'fixture.seats.verify',
    'GET',
    `/performances/${encodeURIComponent(showtimeId)}/seats`,
    null,
    {},
    { limit: 50 },
  ), 'fixture.seats.verify');
  const seats = Array.isArray(seatBody) ? seatBody : seatBody.items || [];
  if (seats.length === 0) {
    fail(`fixture.seats.verify returned no seats for showtime ${showtimeId}`);
  }
}

export function setupSyntheticFixture(config, trace, tokens) {
  const venue = createVenue(config, trace, tokens.provider);
  const concert = createConcert(config, trace, tokens.provider);
  const showtime = createShowtime(config, trace, tokens.provider, concert, venue);
  uploadSeatMap(config, trace, tokens.provider, showtime);
  approveSalePolicy(config, trace, tokens.provider, tokens.admin, concert);
  openSales(config, trace, tokens.admin, concert);
  verifyPublicFixture(config, trace, concert, showtime);
  return { venue, concert, showtime };
}
