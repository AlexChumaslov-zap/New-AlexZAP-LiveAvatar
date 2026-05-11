import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { json, parseBody, method, header } from "../../../lib/lambda.js";

export const handler = async (event) => {
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rl = checkRateLimit(event, {
    windowMs: 60 * 1000,
    max: 60,
    key: "log-event",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  if (typeof payload.event !== "string" || !payload.event) {
    return json(400, { error: "missing_event_field" });
  }

  console.log(
    JSON.stringify({
      event: payload.event,
      reason: payload.reason ?? null,
      source: payload.source ?? "client",
      ts: new Date().toISOString(),
      ua: header(event, "user-agent") ?? null,
    }),
  );
  return { statusCode: 204, body: "" };
};
