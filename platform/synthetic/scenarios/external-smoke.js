import { group } from 'k6';
import { fail } from 'k6';

import { checkAuth } from '../flows/auth.js';
import { checkCatalog } from '../flows/catalog.js';
import { getConfig } from '../lib/config.js';
import { logRunFailed, logRunFinished, logRunStarted } from '../lib/log.js';
import { createTraceContext } from '../lib/trace.js';

export const options = {
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const config = getConfig({ scenario: 'external-smoke', target: 'external' });
  const trace = createTraceContext();
  let step = 'init';

  logRunStarted(config);
  try {
    group('auth.login', () => {
      step = 'auth.login';
      checkAuth(config, trace);
    });
    group('catalog.concerts', () => {
      step = 'catalog.concerts';
      checkCatalog(config, trace);
    });
    logRunFinished(config);
  } catch (error) {
    logRunFailed(config, trace, step, error);
    fail(error.message || String(error));
  }
}
