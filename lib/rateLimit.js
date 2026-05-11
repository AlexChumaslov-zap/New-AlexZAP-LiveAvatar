// Simple in-memory sliding-window rate limiter for AWS Lambda functions
// behind API Gateway HTTP API v2.
//
// Per-instance only — Lambda spawns multiple containers under concurrency,
// so state is not shared. This provides "good-enough" protection, not strict
// guarantees. For stricter limits across all instances, swap to DynamoDB
// or ElastiCache.

const buckets = new Map(); // bucketKey -> { times: number[], windowMs }
const PRUNE_INTERVAL_MS = 60_000;
let lastPrune = Date.now();

/**
 * @param {object} event  - API Gateway v2 event
 * @param {object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.max
 * @param {string} opts.key
 * @returns {{ allowed: boolean, retryAfter?: number, remaining?: number }}
 */
export function checkRateLimit(event, { windowMs, max, key }) {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
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
    const retryAfter = Math.max(
      1,
      Math.ceil((oldestInWindow + windowMs - now) / 1000),
    );
    return { allowed: false, retryAfter };
  }

  bucket.times.push(now);
  return { allowed: true, remaining: max - bucket.times.length };
}

function getClientIp(event) {
  // API Gateway v2 puts the source IP here.
  const sourceIp = event.requestContext?.http?.sourceIp;
  if (sourceIp) return sourceIp;

  const headers = event.headers || {};
  const xff = headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return "unknown";
}

function pruneOldBuckets(now) {
  for (const [k, bucket] of buckets.entries()) {
    const cutoff = now - bucket.windowMs;
    if (bucket.times.length === 0 || bucket.times.every((t) => t <= cutoff)) {
      buckets.delete(k);
    }
  }
}

/** Build a standard 429 response object. */
export function rateLimitedResponse(retryAfter) {
  return {
    statusCode: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(retryAfter),
    },
    body: JSON.stringify({ error: "rate_limited", retryAfter }),
  };
}
