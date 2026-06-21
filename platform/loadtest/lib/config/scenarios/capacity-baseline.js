import {
  nonNegativeNumber,
  optional,
  positiveInteger,
  positiveNumber,
  rate,
  parseStringArray,
} from '../env.js';

const SERVICE_STEP_ALIASES = {
  auth: 'auth-service',
  'auth-service': 'auth-service',
  concert: 'concert-service',
  'concert-service': 'concert-service',
  reservation: 'reservation-service',
  'reservation-service': 'reservation-service',
  payment: 'payment-service',
  'payment-service': 'payment-service',
  ticket: 'ticket-service',
  'ticket-service': 'ticket-service',
  notification: 'notification-service',
  'notification-service': 'notification-service',
};

const DEFAULT_SERVICE_STEPS = [
  'auth-service',
  'concert-service',
  'reservation-service',
  'payment-service',
  'ticket-service',
  'notification-service',
];

function parseJsonObject(name, fallback) {
  const raw = optional(name, JSON.stringify(fallback));
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be a JSON object: ${error.message}`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

function envName(prefix, suffix) {
  return `${prefix}_${suffix}`;
}

function parseServiceSteps(prefix) {
  const name = envName(prefix, 'SERVICE_STEPS');
  const values = parseStringArray(name);
  if (values.length === 0) {
    return DEFAULT_SERVICE_STEPS;
  }
  const seen = new Set();
  return values.map((value, index) => {
    const normalized = SERVICE_STEP_ALIASES[String(value).trim()];
    if (!normalized) {
      throw new Error(`${name}[${index}] must be one of ${Object.keys(SERVICE_STEP_ALIASES).join(', ')}`);
    }
    if (seen.has(normalized)) {
      throw new Error(`${name} contains duplicate service step: ${value}`);
    }
    seen.add(normalized);
    return normalized;
  });
}

function normalizeServiceName(value, fieldName) {
  const normalized = SERVICE_STEP_ALIASES[String(value).trim()];
  if (!normalized) {
    throw new Error(`${fieldName} must be one of ${Object.keys(SERVICE_STEP_ALIASES).join(', ')}`);
  }
  return normalized;
}

function parseStageList(name, stages) {
  if (!Array.isArray(stages)) {
    throw new Error(`${name} must be a JSON array`);
  }
  if (stages.length === 0) {
    throw new Error(`${name} must not be empty`);
  }
  return stages.map((stage, index) => {
    if (!stage || typeof stage !== 'object') {
      throw new Error(`${name}[${index}] must be an object`);
    }
    const duration = String(stage.duration || '').trim();
    const target = Number(stage.target);
    if (!duration) {
      throw new Error(`${name}[${index}].duration is required`);
    }
    if (!Number.isInteger(target) || target < 0) {
      throw new Error(`${name}[${index}].target must be a non-negative integer`);
    }
    return {
      duration,
      target,
      stageRole: stage.stageRole ? String(stage.stageRole) : stage.stage_role ? String(stage.stage_role) : undefined,
    };
  });
}

function parseStagesFromEnv(name) {
  const raw = optional(name, '[]');
  let stages;
  try {
    stages = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be a JSON array: ${error.message}`);
  }
  return parseStageList(name, stages);
}

function parseServiceStages(prefix) {
  const name = envName(prefix, 'SERVICE_STAGES');
  const raw = optional(name, '{}');
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be a JSON object: ${error.message}`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be a JSON object`);
  }
  return Object.fromEntries(Object.entries(value).map(([service, stages]) => [
    normalizeServiceName(service, `${name}.${service}`),
    parseStageList(`${name}.${service}`, stages),
  ]));
}

function parseResourceTargets(prefix) {
  const name = envName(prefix, 'RESOURCE_TARGETS');
  const raw = optional(name, '[]');
  let targets;
  try {
    targets = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} must be JSON: ${error.message}`);
  }
  if (!Array.isArray(targets)) {
    throw new Error(`${name} must be a JSON array`);
  }
  return targets.map((target, index) => {
    if (!target || !target.service || !target.namespace || !target.podSelector) {
      throw new Error(`${name}[${index}] requires service, namespace, podSelector`);
    }
    return {
      service: String(target.service),
      namespace: String(target.namespace),
      podSelector: String(target.podSelector),
      podRegex: target.podRegex ? String(target.podRegex) : `${String(target.service)}-.*`,
    };
  });
}

export function getCapacityLikeServiceConfig({
  envPrefix = 'LOADTEST_CAPACITY_BASELINE',
  requestPrefixDefault = 'loadtest-capacity-baseline',
  stepPrefix = 'capacity_baseline',
  reportType = 'capacity_baseline',
  stageIdMode = 'target',
} = {}) {
  const stages = parseStagesFromEnv(envName(envPrefix, 'STAGES'));
  if (stages.length === 0) {
    throw new Error(`${envName(envPrefix, 'STAGES')} is required`);
  }
  const serviceStages = parseServiceStages(envPrefix);
  const vus = positiveInteger(envName(envPrefix, 'VUS'), 5);
  const preAllocatedVus = positiveInteger(envName(envPrefix, 'PRE_ALLOCATED_VUS'), Math.max(vus, 10));
  const maxVus = positiveInteger(envName(envPrefix, 'MAX_VUS'), Math.max(vus, preAllocatedVus));
  const allStages = [stages, ...Object.values(serviceStages)].flat();
  const stageMax = Math.max(0, ...allStages.map((stage) => stage.target));

  return {
    requestPrefix: optional(envName(envPrefix, 'REQUEST_PREFIX'), requestPrefixDefault),
    requestIdBase: '',
    stepPrefix,
    reportType,
    stageIdMode,
    executor: 'ramping-arrival-rate',
    timeoutSeconds: positiveNumber(envName(envPrefix, 'TIMEOUT_SECONDS'), 10),
    setupTimeout: optional(envName(envPrefix, 'SETUP_TIMEOUT'), '5m'),
    vus,
    rate: positiveInteger(envName(envPrefix, 'RATE'), 1),
    timeUnit: optional(envName(envPrefix, 'TIME_UNIT'), '1s'),
    preAllocatedVUs: preAllocatedVus,
    maxVUs: maxVus,
    plannedMaxVus: Math.max(vus, maxVus, preAllocatedVus, stageMax),
    duration: optional(envName(envPrefix, 'DURATION'), '1m'),
    serviceSteps: parseServiceSteps(envPrefix),
    stages,
    serviceStages,
    gracefulStop: optional(envName(envPrefix, 'GRACEFUL_STOP'), '15s'),
    thinkTimeSeconds: nonNegativeNumber(envName(envPrefix, 'THINK_TIME_SECONDS'), 0),
    activeCustomerCount: positiveInteger(envName(envPrefix, 'ACTIVE_CUSTOMER_COUNT'), 20),
    concertLimit: positiveInteger(envName(envPrefix, 'CONCERT_LIMIT'), 50),
    performanceLimit: positiveInteger(envName(envPrefix, 'PERFORMANCE_LIMIT'), 50),
    seatLimit: positiveInteger(envName(envPrefix, 'SEAT_LIMIT'), 200),
    calendarYearMonth: optional(envName(envPrefix, 'CALENDAR_YEAR_MONTH'), '2026-07'),
    performanceDate: optional(envName(envPrefix, 'PERFORMANCE_DATE'), '2026-07-01'),
    ticketListLimit: positiveInteger(envName(envPrefix, 'TICKET_LIST_LIMIT'), 20),
    paymentAmount: positiveInteger(envName(envPrefix, 'PAYMENT_AMOUNT'), 50000),
    ticketIssuePoolCount: positiveInteger(envName(envPrefix, 'TICKET_ISSUE_POOL_COUNT'), 170000),
    targetUtilization: positiveNumber(envName(envPrefix, 'TARGET_UTILIZATION'), 0.7),
    seedMethod: optional(envName(envPrefix, 'SEED_METHOD'), 'deterministic_bulk_insert'),
    fixedConditions: parseJsonObject(envName(envPrefix, 'FIXED_CONDITIONS'), {}),
    resourceObservation: {
      enabled: optional(envName(envPrefix, 'RESOURCE_OBSERVATION_ENABLED'), 'false') === 'true',
      source: optional(envName(envPrefix, 'RESOURCE_OBSERVATION_SOURCE'), 'prometheus'),
      prometheusUrl: optional(
        envName(envPrefix, 'PROMETHEUS_URL'),
        'http://kube-prometheus-stack-prometheus.monitoring.svc.cluster.local:9090',
      ).replace(/\/+$/, ''),
      queryWindow: optional(envName(envPrefix, 'RESOURCE_QUERY_WINDOW'), '1m'),
      pollEveryIterations: positiveInteger(envName(envPrefix, 'RESOURCE_POLL_EVERY_ITERATIONS'), 10),
      targets: parseResourceTargets(envPrefix),
    },
    schemaRevisions: parseJsonObject(envName(envPrefix, 'SCHEMA_REVISIONS'), {}),
    seedRowCounts: parseJsonObject(envName(envPrefix, 'SEED_ROW_COUNTS'), {}),
    endpointSloP95Ms: parseJsonObject(envName(envPrefix, 'ENDPOINT_SLO_P95_MS'), {
      'capacity_baseline.auth.login': 300,
      'capacity_baseline.concert.recommended': 80,
      'capacity_baseline.concert.detail': 80,
      'capacity_baseline.concert.calendar': 80,
      'capacity_baseline.concert.date_performances': 80,
      'capacity_baseline.concert.seat_map': 150,
      'capacity_baseline.reservation.create': 120,
      'capacity_baseline.payment.create': 120,
      'capacity_baseline.ticket.issue': 120,
      'capacity_baseline.ticket.list': 100,
      'capacity_baseline.notification.list': 80,
    }),
    thresholds: {
      httpReqFailedRate: rate(envName(envPrefix, 'THRESHOLD_HTTP_REQ_FAILED_RATE'), 0.01),
      httpReqDurationP95Ms: positiveNumber(envName(envPrefix, 'THRESHOLD_HTTP_REQ_DURATION_P95_MS'), 100),
      httpReqDurationP99Ms: positiveNumber(envName(envPrefix, 'THRESHOLD_HTTP_REQ_DURATION_P99_MS'), 300),
      checksRate: rate(envName(envPrefix, 'THRESHOLD_CHECKS_RATE'), 0.99),
    },
  };
}

export function getCapacityBaselineConfig() {
  return getCapacityLikeServiceConfig();
}
