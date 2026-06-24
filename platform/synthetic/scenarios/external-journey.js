import { group } from 'k6';

import { loginAdmin, loginCustomer, loginProvider } from '../flows/auth.js';
import { selectSyntheticSeat } from '../flows/catalog.js';
import { setupSyntheticFixture } from '../flows/fixture.js';
import { approvePayment } from '../flows/payment.js';
import { createReservationWithSeatRetry } from '../flows/reservation.js';
import { waitForTicket } from '../flows/ticket.js';
import { waitForNotification } from '../flows/notification.js';
import { getConfig, requireFixtureCredentials } from '../lib/config.js';
import { logRunFailed, logRunFinished, logRunStarted } from '../lib/log.js';
import { failRun, recordRunSuccess, syntheticRunSuccessThreshold } from '../lib/outcome.js';
import { createTraceContext } from '../lib/trace.js';

export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    synthetic_run_success: syntheticRunSuccessThreshold,
  },
};

export default function () {
  const config = getConfig({ scenario: 'external-journey', target: 'external' });
  const trace = createTraceContext();
  const state = {};
  let step = 'init';

  logRunStarted(config);
  try {
    requireFixtureCredentials(config);

    group('auth.login_provider', () => {
      step = 'auth.login_provider';
      state.providerAuth = loginProvider(config, trace);
    });
    group('auth.login_admin', () => {
      step = 'auth.login_admin';
      state.adminAuth = loginAdmin(config, trace);
    });
    group('auth.login_customer', () => {
      step = 'auth.login_customer';
      state.customerAuth = loginCustomer(config, trace);
      state.customerToken = state.customerAuth.accessToken;
      state.customer = state.customerAuth.user;
    });
    group('fixture.setup', () => {
      step = 'fixture.setup';
      state.fixture = setupSyntheticFixture(config, trace, {
        provider: state.providerAuth.accessToken,
        admin: state.adminAuth.accessToken,
      });
      state.concert = state.fixture.concert;
      state.showtime = state.fixture.showtime;
    });

    group('reservation.create', () => {
      step = 'reservation.create';
      const result = createReservationWithSeatRetry(config, trace, state.customerToken, (attempt) => {
        step = attempt === 0 ? 'catalog.select_seat' : `catalog.select_seat.retry_${attempt}`;
        return selectSyntheticSeat(config, trace, attempt, state.fixture);
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

    recordRunSuccess();
    logRunFinished(config, state);
  } catch (error) {
    logRunFailed(config, trace, step, error, state);
    failRun(error);
  }
}
