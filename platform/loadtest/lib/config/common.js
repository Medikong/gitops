import { optional, required } from './env.js';

function baseUrlForTarget(target) {
  if (target === 'local') {
    return optional('LOADTEST_LOCAL_BASE_URL', required('LOADTEST_BASE_URL'));
  }
  if (target === 'aws') {
    return optional('LOADTEST_AWS_BASE_URL', required('LOADTEST_BASE_URL'));
  }
  return required('LOADTEST_BASE_URL');
}

export function getCommonConfig() {
  const target = optional('LOADTEST_TARGET', 'local');
  const scenario = optional('LOADTEST_SCENARIO', 'read-api-baseline');
  const environment = optional('LOADTEST_ENVIRONMENT', target);
  const runId = optional('LOADTEST_RUN_ID', `${Date.now()}`);
  const imageTag = optional('LOADTEST_IMAGE_TAG', 'unknown');

  return {
    testType: optional('LOADTEST_TEST_TYPE', 'loadtest'),
    scenario,
    environment,
    target,
    runId,
    baseUrl: baseUrlForTarget(target).replace(/\/+$/, ''),
    revision: optional('LOADTEST_REVISION', imageTag),
    image: optional('LOADTEST_IMAGE'),
    imageTag,
    release: optional('LOADTEST_RELEASE'),
    namespace: optional('LOADTEST_NAMESPACE'),
  };
}
