// Lightweight health probe for the LiveAvatar API.
// Frontend polls every ~30s to decide whether to attempt the SDK or pre-emptively show fallback.

let cached = { result: null, ts: 0 };
const TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

export const handler = async () => {
  if (process.env.FORCE_API_DOWN === '1') {
    return respond({ ok: false, reason: 'forced' });
  }

  const now = Date.now();
  if (cached.result && now - cached.ts < TTL_MS) {
    return respond({ ...cached.result, cached: true });
  }

  const base = process.env.LIVEAVATAR_API_BASE ?? 'https://api.liveavatar.com';
  let result;
  try {
    const r = await fetch(base, {
      method: 'HEAD',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Any HTTP response means DNS+TCP+TLS reached the host; treat as healthy.
    result = { ok: true, status: r.status };
  } catch (err) {
    result = { ok: false, reason: err?.name === 'TimeoutError' ? 'timeout' : 'network_error' };
  }

  cached = { result, ts: now };
  return respond(result);
};

function respond(body) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
