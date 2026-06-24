import { fail, sleep } from 'k6';

import { requireJson } from '../lib/checks.js';
import { authHeaders, request } from '../lib/http.js';

const ticketListLimit = 100;

function ticketMatches(ticket, reservation) {
  return String(ticket.reservationId) === String(reservation.id);
}

function itemsFrom(body) {
  return Array.isArray(body) ? body : body.items || [];
}

function nextCursorFrom(body) {
  return Array.isArray(body) ? null : body.nextCursor || null;
}

function findTicket(config, trace, token, reservation) {
  let cursor = null;
  do {
    const step = cursor ? 'ticket.list.next' : 'ticket.list';
    const response = request(
      config,
      trace,
      step,
      'GET',
      '/tickets/me',
      null,
      authHeaders(token),
      { limit: ticketListLimit, cursor },
    );
    const body = requireJson(response, step);
    const ticket = itemsFrom(body).find((item) => ticketMatches(item, reservation));
    if (ticket) {
      return ticket;
    }
    cursor = nextCursorFrom(body);
  } while (cursor);
  return null;
}

export function waitForTicket(config, trace, token, reservation) {
  const deadline = Date.now() + config.pollSeconds * 1000;
  while (Date.now() <= deadline) {
    const ticket = findTicket(config, trace, token, reservation);
    if (ticket) {
      return ticket;
    }
    sleep(config.pollIntervalSeconds);
  }
  fail(`ticket.list did not return a ticket for reservation ${reservation.id}`);
  return null;
}
