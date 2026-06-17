import { optional, parseStringArray, required } from './env.js';

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
  const k6Output = optional('K6_OUTPUT');
  const k6ExtraArgs = parseStringArray('LOADTEST_K6_EXTRA_ARGS');
  const k6ScenarioFile = `/loadtest/scenarios/${scenario}.js`;
  const k6CommandArgs = [
    'run',
    '--log-format=raw',
    ...(k6Output ? ['--out', k6Output] : []),
    ...k6ExtraArgs,
    k6ScenarioFile,
  ];

  return {
    testType: optional('LOADTEST_TEST_TYPE', 'loadtest'),
    scenario,
    environment,
    target,
    runId,
    baseUrl: baseUrlForTarget(target).replace(/\/+$/, ''),
    gitSha: optional('LOADTEST_GIT_SHA', 'unknown'),
    startedAt: optional('LOADTEST_STARTED_AT', new Date().toISOString()),
    reportDir: optional('LOADTEST_REPORT_DIR'),
    revision: optional('LOADTEST_REVISION', imageTag),
    image: optional('LOADTEST_IMAGE'),
    imageTag,
    release: optional('LOADTEST_RELEASE'),
    namespace: optional('LOADTEST_NAMESPACE'),
    k6Output,
    k6ExtraArgs,
    k6ScenarioFile,
    k6Command: 'k6',
    k6CommandArgs,
  };
}
