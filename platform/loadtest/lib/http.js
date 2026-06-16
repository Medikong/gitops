import http from 'k6/http';
import { check, fail } from 'k6';

import { logStep } from './log.js';

function encodeQuery(params) {
  const entries = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return '';
  }
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
}

export function getJson(config, step, path, query = {}) {
  return requestJson(config, step, 'GET', path, null, {}, query);
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function routeLabel(step, method, path) {
  const knownReadRoutes = {
    'read_api.concerts': 'GET /concerts',
    'read_api.performances': 'GET /concerts/{id}/performances',
    'read_api.seats': 'GET /performances/{id}/seats',
    'dataset.customer.signup': 'POST /auth/signup',
    'dataset.customer.login_verify': 'POST /auth/login',
    'reservation_journey.auth.login': 'POST /auth/login',
    'reservation_journey.concerts': 'GET /concerts',
    'reservation_journey.performances': 'GET /concerts/{id}/performances',
    'reservation_journey.seats': 'GET /performances/{id}/seats',
    'reservation_journey.reservation.create': 'POST /reservations',
    'reservation_journey.payment.approve': 'POST /payments',
    'reservation_journey.ticket.list': 'GET /tickets/me',
  };
  return knownReadRoutes[step] || `${method} ${step || path}`;
}

export function requestJson(config, step, method, path, body = null, extraHeaders = {}, query = {}) {
  const url = `${config.baseUrl}${path}${encodeQuery(query)}`;
  const route = routeLabel(step, method, path);
  const requestId = `${config.requestIdBase}-${step.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const payload = body === null || body === undefined ? null : JSON.stringify(body);
  const response = http.request(method, url, payload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Loadtest-Traffic': 'true',
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
    timeout: `${config.timeoutSeconds}s`,
    tags: {
      environment: config.environment,
      profile: config.dataset.profile,
      test_type: config.testType,
      name: route,
      route,
      step,
      target: config.target,
    },
  });

  logStep(config, step, response);
  const ok = check(response, {
    [`${step} returned 2xx`]: (res) => res.status >= 200 && res.status < 300,
    [`${step} returned json`]: (res) => String(res.headers['Content-Type'] || res.headers['content-type'] || '').includes('application/json'),
  }, {
    environment: config.environment,
    profile: config.dataset.profile,
    test_type: config.testType,
    route,
    step,
    target: config.target,
  });
  if (!ok) {
    fail(`${step} failed with status ${response.status}`);
  }

  try {
    return response.json();
  } catch (error) {
    fail(`${step} returned invalid json: ${error.message}`);
  }
}

export function requestWithExpectedStatuses(config, step, method, path, body = null, extraHeaders = {}, query = {}, expectedStatuses = []) {
  const url = `${config.baseUrl}${path}${encodeQuery(query)}`;
  const route = routeLabel(step, method, path);
  const requestId = `${config.requestIdBase}-${step.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const payload = body === null || body === undefined ? null : JSON.stringify(body);
  const response = http.request(method, url, payload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Loadtest-Traffic': 'true',
      'X-Request-Id': requestId,
      ...extraHeaders,
    },
    timeout: `${config.timeoutSeconds}s`,
    responseCallback: http.expectedStatuses(...expectedStatuses),
    tags: {
      environment: config.environment,
      profile: config.dataset.profile,
      test_type: config.testType,
      name: route,
      route,
      step,
      target: config.target,
    },
  });

  logStep(config, step, response);
  const ok = check(response, {
    [`${step} returned expected status`]: (res) => expectedStatuses.includes(res.status),
  }, {
    environment: config.environment,
    profile: config.dataset.profile,
    test_type: config.testType,
    route,
    step,
    target: config.target,
  });
  if (!ok) {
    fail(`${step} failed with status ${response.status}`);
  }
  return response;
}
