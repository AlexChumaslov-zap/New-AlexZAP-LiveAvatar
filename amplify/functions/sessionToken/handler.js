import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { json } from "../../../lib/lambda.js";

export const handler = async (event) => {
  const rl = checkRateLimit(event, {
    windowMs: 5 * 60 * 1000,
    max: 10,
    key: "session-token",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const {
    LIVEAVATAR_API_KEY,
    LIVEAVATAR_API_BASE = "https://api.liveavatar.com",
    LIVEAVATAR_AVATAR_ID,
    LIVEAVATAR_CONTEXT_ID,
    LIVEAVATAR_VOICE_ID,
    LIVEAVATAR_SANDBOX,
    FORCE_API_DOWN,
  } = process.env;

  if (FORCE_API_DOWN === "1") return json(503, { error: "forced_down" });
  if (!LIVEAVATAR_API_KEY || !LIVEAVATAR_AVATAR_ID) {
    return json(500, { error: "missing_env" });
  }

  const isSandbox = LIVEAVATAR_SANDBOX === "true" || LIVEAVATAR_SANDBOX === "1";

  // HeyGen's voice_id and context_id must be UUIDs. Amplify Gen 2 secrets
  // can't be empty, so operators sometimes set placeholders like "<unset>"
  // or "none". Validate the UUID format and treat anything else as missing
  // — passing a non-UUID string through to HeyGen returns a 422 and aborts
  // the session.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const voiceId = UUID_RE.test(LIVEAVATAR_VOICE_ID || "")
    ? LIVEAVATAR_VOICE_ID
    : null;
  const contextId = UUID_RE.test(LIVEAVATAR_CONTEXT_ID || "")
    ? LIVEAVATAR_CONTEXT_ID
    : null;

  try {
    const r = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": LIVEAVATAR_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "FULL",
        is_sandbox: isSandbox,
        avatar_id: LIVEAVATAR_AVATAR_ID,
        interactivity_type: "CONVERSATIONAL",
        avatar_persona: {
          language: "en",
          ...(voiceId && { voice_id: voiceId }),
          ...(contextId && { context_id: contextId }),
        },
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return json(r.status, {
        error: "liveavatar_token_failed",
        status: r.status,
        details: body,
      });
    }
    const data = body?.data ?? {};
    return json(200, {
      session_id: data.session_id,
      session_token: data.session_token,
    });
  } catch (err) {
    return json(500, { error: "unexpected", message: String(err) });
  }
};
