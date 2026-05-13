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

  // Sentinel values that mean "not actually set" — Amplify Gen 2 secrets
  // can't be empty, so the operator has to write something. Treat common
  // placeholders as missing so we don't pass them through to HeyGen as a
  // literal ID (which would fail with a 4xx).
  const SENTINELS = new Set(["", "none", "unset", "null", "n/a", "-"]);
  const voiceId =
    LIVEAVATAR_VOICE_ID && !SENTINELS.has(LIVEAVATAR_VOICE_ID.toLowerCase())
      ? LIVEAVATAR_VOICE_ID
      : null;
  const contextId =
    LIVEAVATAR_CONTEXT_ID && !SENTINELS.has(LIVEAVATAR_CONTEXT_ID.toLowerCase())
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
