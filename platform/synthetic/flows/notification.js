import { fail, sleep } from 'k6';

import { requireJson } from '../lib/checks.js';
import { authHeaders, request } from '../lib/http.js';

function notificationMatches(notification, state) {
  const values = [
    notification.reservationId,
    notification.ticketId,
    notification.sourceId,
    notification.id,
    notification.message,
  ].map((value) => String(value || ''));
  return values.some((value) => value.includes(String(state.reservation.id)))
    || (state.ticket && values.some((value) => value.includes(String(state.ticket.id))));
}

export function waitForNotification(config, trace, token, state) {
  const deadline = Date.now() + config.pollSeconds * 1000;
  while (Date.now() <= deadline) {
    const response = request(config, trace, 'notification.list', 'GET', '/notifications', null, authHeaders(token));
    const body = requireJson(response, 'notification.list');
    const items = Array.isArray(body) ? body : body.items || [];
    const notification = items.find((item) => notificationMatches(item, state));
    if (notification) {
      return notification;
    }
    sleep(config.pollIntervalSeconds);
  }
  fail(`notification.list did not return a notification for reservation ${state.reservation.id}`);
  return null;
}
