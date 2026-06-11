import { requireField, requireJson } from '../lib/checks.js';
import { authHeaders, request } from '../lib/http.js';

export function approvePayment(config, trace, token, reservation, target) {
  const response = request(
    config,
    trace,
    'payment.approve',
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
  const body = requireJson(response, 'payment.approve');
  requireField(body, 'id', 'payment.approve');
  requireField(body, 'status', 'payment.approve');
  return body;
}
