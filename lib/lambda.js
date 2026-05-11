// Shared helpers for Lambda handlers behind API Gateway HTTP API v2.
//
// API Gateway HTTP API v2 event shape (relevant fields):
//   event.requestContext.http.method
//   event.queryStringParameters     (object, may be undefined)
//   event.pathParameters            (object, may be undefined — populated for {id} routes)
//   event.body                      (string, may be undefined)
//   event.isBase64Encoded
//   event.headers                   (object, lowercased keys)
//
// Response shape:
//   { statusCode: 200, headers: {...}, body: 'string', isBase64Encoded: false }

const JSON_HEADERS = { "content-type": "application/json" };

/** Build a JSON response. */
export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

/** Build a plain-text response. */
export function text(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "content-type": "text/plain", ...extraHeaders },
    body: String(body ?? ""),
  };
}

/** Build an empty (no-body) response. */
export function empty(statusCode, extraHeaders = {}) {
  return {
    statusCode,
    headers: extraHeaders,
    body: "",
  };
}

/** Parse the body as JSON. Returns null on parse failure. */
export function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

/** HTTP method from the event. */
export function method(event) {
  return event.requestContext?.http?.method ?? event.httpMethod ?? "";
}

/** Get a header by lowercased name (handles both cases). */
export function header(event, name) {
  const h = event.headers || {};
  return h[name] ?? h[name.toLowerCase()];
}

/** Get a path parameter (e.g. {id}). */
export function pathParam(event, name) {
  return event.pathParameters?.[name];
}
