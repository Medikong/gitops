function header(response, name) {
  const wanted = name.toLowerCase();
  const headers = response.headers || {};
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      return headers[key];
    }
  }
  return null;
}

function traceIdFromTraceparent(value) {
  if (!value) {
    return null;
  }
  const parts = String(value).split('-');
  return parts.length >= 2 ? parts[1] : null;
}

export function createTraceContext() {
  let traceparent = null;
  let traceId = null;

  return {
    headers() {
      return traceparent ? { traceparent } : {};
    },
    capture(response) {
      const nextTraceparent = header(response, 'traceparent');
      const nextTraceId = header(response, 'X-Trace-Id');
      if (nextTraceparent) {
        traceparent = nextTraceparent;
        traceId = traceIdFromTraceparent(nextTraceparent) || traceId;
      }
      if (nextTraceId) {
        traceId = nextTraceId;
      }
    },
    traceId() {
      return traceId;
    },
    traceparent() {
      return traceparent;
    },
  };
}
