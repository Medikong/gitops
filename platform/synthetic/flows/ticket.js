import { fail, sleep } from 'k6';

import { requireJson } from '../lib/checks.js';
import { authHeaders, request } from '../lib/http.js';

function ticketMatches(ticket, reservation) {
  return String(ticket.reservationId) === String(reservation.id);
}

export function waitForTicket(config, trace, token, reservation) {
  const deadline = Date.now() + config.pollSeconds * 1000;
  while (Date.now() <= deadline) {
    const response = request(config, trace, 'ticket.list', 'GET', '/tickets/me', null, authHeaders(token));
    const body = requireJson(response, 'ticket.list');
    const items = Array.isArray(body) ? body : body.items || [];
    const ticket = items.find((item) => ticketMatches(item, reservation));
    if (ticket) {
      return ticket;
    }
    sleep(config.pollIntervalSeconds);
  }
  fail(`ticket.list did not return a ticket for reservation ${reservation.id}`);
  return null;
}
