import http from 'k6/http';

import { check2xx, failStep } from './checks.js';
import { logStep } from './log.js';

function encodeQuery(params) {
  const entries = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return '';
  }
  return `?${entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
}

export function requestWithExpectedStatuses(config, trace, step, method, path, body = null, extraHeaders = {}, query = {}, expectedStatuses = null) {
  const url = `${config.baseUrl}${path}${encodeQuery(query)}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Synthetic-Traffic': 'true',
    'X-Request-Id': `${config.requestIdBase}-${step.replace(/[^a-zA-Z0-9]/g, '-')}`,
    ...trace.headers(),
    ...extraHeaders,
  };
  const params = {
    headers,
    timeout: `${config.timeoutSeconds}s`,
    tags: {
      scenario: config.scenario,
      step,
      target: config.target,
    },
  };
  const payload = body === null || body === undefined ? null : JSON.stringify(body);
  const response = http.request(method, url, payload, params);
  trace.capture(response);
  logStep(config, trace, step, response);

  const expected = expectedStatuses || [];
  const ok = expected.length > 0 ? expected.includes(response.status) : check2xx(response, step);
  if (!ok) {
    failStep(step, response);
  }
  return response;
}

export function request(config, trace, step, method, path, body = null, extraHeaders = {}, query = {}) {
  return requestWithExpectedStatuses(config, trace, step, method, path, body, extraHeaders, query);
}

export function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
