import { getCapacityLikeServiceConfig } from './capacity-baseline.js';

export function getServiceHpaSpikeConfig() {
  return getCapacityLikeServiceConfig({
    envPrefix: 'LOADTEST_SERVICE_HPA_SPIKE',
    requestPrefixDefault: 'loadtest-service-hpa-spike',
    stepPrefix: 'capacity_baseline',
    reportType: 'service_hpa_spike',
    stageIdMode: 'role_target',
  });
}
