function emit(event, fields) {
  console.log(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  }));
}

export function logRunStarted(config) {
  emit('synthetic_run_started', {
    synthetic_run_id: config.runId,
    scenario: config.scenario,
    target: config.target,
    target_base_url: config.baseUrl,
  });
}

export function logRunFinished(config, state = {}) {
  emit('synthetic_run_finished', {
    synthetic_run_id: config.runId,
    scenario: config.scenario,
    target: config.target,
    target_base_url: config.baseUrl,
    reservation_id: state.reservation && state.reservation.id,
    payment_id: state.payment && state.payment.id,
    ticket_id: state.ticket && state.ticket.id,
    concert_id: state.concert && state.concert.id,
    showtime_id: state.showtime && state.showtime.id,
  });
}

export function logRunFailed(config, trace, step, error, state = {}) {
  emit('synthetic_run_failed', {
    synthetic_run_id: config.runId,
    scenario: config.scenario,
    step,
    target: config.target,
    target_base_url: config.baseUrl,
    error_message: error && error.message ? error.message : String(error),
    request_id: config.requestIdBase,
    trace_id: trace && trace.traceId ? trace.traceId() : null,
    traceparent: trace && trace.traceparent ? trace.traceparent() : null,
    reservation_id: state.reservation && state.reservation.id,
    payment_id: state.payment && state.payment.id,
    ticket_id: state.ticket && state.ticket.id,
  });
}

export function logStep(config, trace, step, response, extra = {}) {
  emit('synthetic_step', {
    synthetic_run_id: config.runId,
    scenario: config.scenario,
    step,
    target: config.target,
    target_base_url: config.baseUrl,
    http_status: response.status,
    request_id: response.headers['X-Request-Id'] || response.headers['x-request-id'] || config.requestIdBase,
    trace_id: trace.traceId(),
    traceparent: trace.traceparent(),
    ...extra,
  });
}
