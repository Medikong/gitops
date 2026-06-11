import { group } from 'k6';
import { fail } from 'k6';

import { loginAdmin, loginCustomer, loginProvider } from '../flows/auth.js';
import { setupSyntheticFixture } from '../flows/fixture.js';
import { getConfig, requireFixtureCredentials } from '../lib/config.js';
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
  const config = getConfig({ scenario: 'setup-fixture' });
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
    });
    group('fixture.setup', () => {
      step = 'fixture.setup';
      state.fixture = setupSyntheticFixture(config, trace, {
        provider: state.providerAuth.accessToken,
        admin: state.adminAuth.accessToken,
      });
    });

    logRunFinished(config, {
      concert: state.fixture && state.fixture.concert,
      showtime: state.fixture && state.fixture.showtime,
    });
  } catch (error) {
    logRunFailed(config, trace, step, error, state);
    fail(error.message || String(error));
  }
}
