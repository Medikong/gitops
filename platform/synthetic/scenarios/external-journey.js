import { group } from 'k6';
import { fail } from 'k6';

import { loginCustomer } from '../flows/auth.js';
import { selectSyntheticSeat } from '../flows/catalog.js';
import { approvePayment } from '../flows/payment.js';
import { createReservationWithSeatRetry } from '../flows/reservation.js';
import { waitForTicket } from '../flows/ticket.js';
import { waitForNotification } from '../flows/notification.js';
import { getConfig } from '../lib/config.js';
import { logRunFailed, logRunFinished, logRunStarted } from '../lib/log.js';
import { createTraceContext } from '../lib/trace.js';

export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default function () {
  const config = getConfig({ scenario: 'external-journey', target: 'external' });
  const trace = createTraceContext();
  const state = {};
  let step = 'init';

  logRunStarted(config);
  try {
    group('auth.login', () => {
      step = 'auth.login';
      state.auth = loginCustomer(config, trace);
      state.customerToken = state.auth.accessToken;
      state.customer = state.auth.user;
    });

    group('reservation.create', () => {
      step = 'reservation.create';
      const result = createReservationWithSeatRetry(config, trace, state.customerToken, (attempt) => {
        step = attempt === 0 ? 'catalog.select_seat' : `catalog.select_seat.retry_${attempt}`;
        return selectSyntheticSeat(config, trace, attempt);
      });
      state.target = result.target;
      state.reservation = result.reservation;
    });

    group('payment.approve', () => {
      step = 'payment.approve';
      state.payment = approvePayment(config, trace, state.customerToken, state.reservation, state.target);
    });

    group('ticket.wait', () => {
      step = 'ticket.wait';
      state.ticket = waitForTicket(config, trace, state.customerToken, state.reservation);
    });

    group('notification.wait', () => {
      step = 'notification.wait';
      state.notification = waitForNotification(config, trace, state.customerToken, state);
    });

    logRunFinished(config, state);
  } catch (error) {
    logRunFailed(config, trace, step, error, state);
    fail(error.message || String(error));
  }
}
