import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { json } from "../../../lib/lambda.js";

let cached = { result: null, ts: 0 };
const TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3_000;

export const handler = async (event) => {
  const rl = checkRateLimit(event, {
    windowMs: 60 * 1000,
    max: 30,
    key: "health",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const extraHeaders = { "cache-control": "no-store" };

  if (process.env.FORCE_API_DOWN === "1") {
    return json(200, { ok: false, reason: "forced" }, extraHeaders);
  }

  const now = Date.now();
  if (cached.result && now - cached.ts < TTL_MS) {
    return json(200, { ...cached.result, cached: true }, extraHeaders);
  }

  const base = process.env.LIVEAVATAR_API_BASE ?? "https://api.liveavatar.com";
  let result;
  try {
    const r = await fetch(base, {
      method: "HEAD",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    result = { ok: true, status: r.status };
  } catch (err) {
    result = {
      ok: false,
      reason: err?.name === "TimeoutError" ? "timeout" : "network_error",
    };
  }
  cached = { result, ts: now };
  return json(200, result, extraHeaders);
};
