import { fail } from 'k6';

import { setupReadApiBasicDataset } from './datasets/read-api-basic.js';

const datasetProfiles = {
  'read-api-basic': setupReadApiBasicDataset,
};

export function supportedDatasetProfiles() {
  return Object.keys(datasetProfiles).sort();
}

export function setupDatasetProfile(config, tokens) {
  const setup = datasetProfiles[config.dataset.profile];
  if (!setup) {
    fail(`unsupported LOADTEST_DATASET_PROFILE=${config.dataset.profile}; supported profiles: ${supportedDatasetProfiles().join(', ')}`);
  }
  return setup(config, tokens);
}
