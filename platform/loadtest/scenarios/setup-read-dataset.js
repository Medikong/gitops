import { group, fail } from 'k6';

import { loginAdmin, loginProvider } from '../lib/auth.js';
import { getConfig, requireDatasetCredentials } from '../lib/config.js';
import { logDatasetFinished, logRunFailed, logRunStarted } from '../lib/log.js';
import { setupDatasetProfile } from '../flows/dataset.js';

const config = getConfig();

export const options = {
  scenarios: {
    setup_read_dataset: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '30m',
      tags: {
        test_type: config.testType,
        scenario: config.scenario,
        phase: 'dataset_setup',
        target: config.target,
      },
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<3000'],
  },
  tags: {
    test_type: config.testType,
    scenario: config.scenario,
    phase: 'dataset_setup',
    target: config.target,
  },
};

export default function setupDataset() {
  logRunStarted(config);
  try {
    requireDatasetCredentials(config);
    const tokens = {};
    group('dataset.auth', () => {
      tokens.provider = loginProvider(config).accessToken;
      tokens.admin = loginAdmin(config).accessToken;
    });
    const state = {};
    group('dataset.setup', () => {
      Object.assign(state, setupDatasetProfile(config, tokens));
    });
    logDatasetFinished(config, state);
  } catch (error) {
    logRunFailed(config, 'setup_read_dataset', error);
    fail(error.message || String(error));
  }
}
