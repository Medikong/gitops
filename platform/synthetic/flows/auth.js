import { requireField, requireJson } from '../lib/checks.js';
import { request } from '../lib/http.js';

export function loginWithCredentials(config, trace, step, email, password) {
  const response = request(config, trace, step, 'POST', '/auth/login', {
    email,
    password,
  });
  const body = requireJson(response, step);
  return {
    accessToken: requireField(body, 'accessToken', step),
    user: requireField(body, 'user', step),
  };
}

export function loginCustomer(config, trace) {
  return loginWithCredentials(config, trace, 'auth.login', config.customerEmail, config.customerPassword);
}

export function loginProvider(config, trace) {
  return loginWithCredentials(config, trace, 'auth.login_provider', config.providerEmail, config.providerPassword);
}

export function loginAdmin(config, trace) {
  return loginWithCredentials(config, trace, 'auth.login_admin', config.adminEmail, config.adminPassword);
}

export function checkAuth(config, trace) {
  return loginCustomer(config, trace);
}
