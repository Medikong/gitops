import { check, fail } from 'k6';

export function requireJson(response, step) {
  let parsed;
  try {
    parsed = response.json();
  } catch (error) {
    fail(`${step} response is not valid JSON: ${String(response.body).slice(0, 300)}`);
  }
  return parsed;
}

export function requireField(object, field, step) {
  if (object[field] === undefined || object[field] === null || object[field] === '') {
    fail(`${step} response missing ${field}`);
  }
  return object[field];
}

export function check2xx(response, step) {
  return check(response, {
    [`${step} status is 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}

export function failStep(step, response) {
  fail(`${step} failed with status ${response.status}: ${String(response.body).slice(0, 500)}`);
}
