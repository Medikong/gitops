function required(name) {
  const value = __ENV[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(name, fallback = '') {
  const value = __ENV[name];
  return value === undefined || value === null || value === '' ? fallback : value;
}

function positiveNumber(name, fallback) {
  const raw = optional(name, String(fallback));
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function positiveInteger(name, fallback) {
  const value = positiveNumber(name, fallback);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function scenarioDefault() {
  const name = (__ENV.SYNTHETIC_SCENARIO || 'external-journey').trim();
  return name || 'external-journey';
}

function baseUrlForScenario(scenario) {
  if (scenario === 'internal-smoke') {
    return optional('SYNTHETIC_INTERNAL_BASE_URL', required('SYNTHETIC_BASE_URL'));
  }
  if (scenario === 'external-smoke' || scenario === 'external-journey') {
    return optional('SYNTHETIC_EXTERNAL_BASE_URL', required('SYNTHETIC_BASE_URL'));
  }
  return required('SYNTHETIC_BASE_URL');
}

export function getConfig(overrides = {}) {
  const scenario = overrides.scenario || scenarioDefault();
  const baseUrl = (overrides.baseUrl || baseUrlForScenario(scenario)).replace(/\/+$/, '');
  const target = overrides.target || optional('SYNTHETIC_TARGET', scenario.startsWith('internal') ? 'internal' : 'external');
  const runId = optional('SYNTHETIC_RUN_ID', `${Date.now()}-${__VU}-${__ITER}`);
  const requestPrefix = optional('SYNTHETIC_REQUEST_PREFIX', 'synthetic');

  return {
    scenario,
    target,
    runId,
    baseUrl,
    requestPrefix,
    requestIdBase: `${requestPrefix}-${runId}`,
    timeoutSeconds: positiveNumber('SYNTHETIC_TIMEOUT_SECONDS', 10),
    pollSeconds: positiveNumber('SYNTHETIC_POLL_SECONDS', 45),
    pollIntervalSeconds: positiveNumber('SYNTHETIC_POLL_INTERVAL_SECONDS', 2),
    paymentAmount: positiveInteger('SYNTHETIC_PAYMENT_AMOUNT', 50000),
    maxSeatAttempts: positiveInteger('SYNTHETIC_MAX_SEAT_ATTEMPTS', 3),
    concertId: optional('SYNTHETIC_CONCERT_ID'),
    concertTitle: optional('SYNTHETIC_CONCERT_TITLE', 'Medikong Synthetic E2E'),
    fixtureLookaheadDays: positiveInteger('SYNTHETIC_FIXTURE_LOOKAHEAD_DAYS', 7),
    fixtureSeatRows: positiveInteger('SYNTHETIC_FIXTURE_SEAT_ROWS', 5),
    fixtureSeatsPerRow: positiveInteger('SYNTHETIC_FIXTURE_SEATS_PER_ROW', 20),
    customerEmail: required('SYNTHETIC_CUSTOMER_EMAIL'),
    customerPassword: required('SYNTHETIC_CUSTOMER_PASSWORD'),
    providerEmail: optional('SYNTHETIC_PROVIDER_EMAIL'),
    providerPassword: optional('SYNTHETIC_PROVIDER_PASSWORD'),
    adminEmail: optional('SYNTHETIC_ADMIN_EMAIL'),
    adminPassword: optional('SYNTHETIC_ADMIN_PASSWORD'),
  };
}

export function requireFixtureCredentials(config) {
  const missing = [
    ['SYNTHETIC_PROVIDER_EMAIL', config.providerEmail],
    ['SYNTHETIC_PROVIDER_PASSWORD', config.providerPassword],
    ['SYNTHETIC_ADMIN_EMAIL', config.adminEmail],
    ['SYNTHETIC_ADMIN_PASSWORD', config.adminPassword],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`${missing.join(', ')} required for synthetic fixture setup`);
  }
}
