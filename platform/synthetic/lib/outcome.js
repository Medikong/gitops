import { fail } from 'k6';
import { Rate } from 'k6/metrics';

export const syntheticRunSuccess = new Rate('synthetic_run_success');

export const syntheticRunSuccessThreshold = ['rate==1'];

export function recordRunSuccess() {
  syntheticRunSuccess.add(1);
}

export function failRun(error) {
  syntheticRunSuccess.add(0);
  fail(error && error.message ? error.message : String(error));
}
