// Server-side incident sink. Frontend POSTs structured events; we log them as JSON.
// Netlify aggregates Function logs in the dashboard (Functions tab) — queryable & filterable.

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_json' }) };
  }

  if (typeof payload.event !== 'string' || !payload.event) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_event_field' }) };
  }

  const record = {
    event: payload.event,
    reason: payload.reason ?? null,
    source: payload.source ?? 'client',
    ts: new Date().toISOString(),
    ua: event.headers['user-agent'] ?? null,
  };

  console.log(JSON.stringify(record));
  return { statusCode: 204, body: '' };
};
