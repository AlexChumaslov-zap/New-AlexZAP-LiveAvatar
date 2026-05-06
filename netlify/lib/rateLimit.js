// Simple in-memory sliding-window rate limiter for Netlify Functions.
//
// Per-instance only. Netlify spawns multiple Lambda instances under load, and
// state is not shared across them — so this provides "good-enough" protection,
// not strict guarantees. To bypass, an attacker has to trigger cold starts,
// which is much harder than unlimited access.
//
// For stricter limits (paid abuse, multi-instance correctness), upgrade to
// Netlify Blobs (free) or an external KV store (Upstash, Redis).

const buckets = new Map(); // bucketKey -> { times: number[], windowMs }
const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

/**
 * @param {object} event - Netlify Function event
 * @param {object} opts
 * @param {number} opts.windowMs - sliding window length in ms
 * @param {number} opts.max - max requests allowed in the window
 * @param {string} opts.key - logical bucket name (e.g. 'session-token')
 * @returns {{ allowed: boolean, retryAfter?: number, remaining?: number }}
 */
export function checkRateLimit(event, { windowMs, max, key }) {
  // Bypass in local dev (`netlify dev` sets NETLIFY_DEV=true) and on explicit
  // opt-out via RATE_LIMIT_DISABLED=1 (useful for QA/load-testing on staging).
  if (
    process.env.NETLIFY_DEV === 'true' ||
    process.env.RATE_LIMIT_DISABLED === '1'
  ) {
    return { allowed: true, remaining: max };
  }

  const ip = getClientIp(event);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();

  if (now - lastPrune > PRUNE_INTERVAL_MS) {
    pruneOldBuckets(now);
    lastPrune = now;
  }

  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    bucket = { times: [], windowMs };
    buckets.set(bucketKey, bucket);
  }

  const cutoff = now - windowMs;
  bucket.times = bucket.times.filter((t) => t > cutoff);

  if (bucket.times.length >= max) {
    const oldestInWindow = bucket.times[0];
    const retryAfter = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
    return { allowed: false, retryAfter };
  }

  bucket.times.push(now);
  return { allowed: true, remaining: max - bucket.times.length };
}

function getClientIp(event) {
  const headers = event.headers || {};
  // Netlify-specific real-client header (most reliable)
  const nfIp = headers['x-nf-client-connection-ip'];
  if (nfIp) return nfIp;
  // X-Forwarded-For: first entry is the original client
  const xff = headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

function pruneOldBuckets(now) {
  for (const [k, bucket] of buckets.entries()) {
    const cutoff = now - bucket.windowMs;
    if (bucket.times.length === 0 || bucket.times.every((t) => t <= cutoff)) {
      buckets.delete(k);
    }
  }
}

/** Build the standard 429 response with Retry-After header */
export function rateLimitedResponse(retryAfter) {
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
    body: JSON.stringify({ error: 'rate_limited', retryAfter }),
  };
}
