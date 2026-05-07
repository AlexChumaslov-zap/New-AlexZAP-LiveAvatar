// POST /api/conversation/end — mark a Conversation as ended.
// Sets status='ended' and stamps end_time. Idempotent — re-ending a
// conversation that's already ended is a no-op (still returns 200).

import { checkRateLimit, rateLimitedResponse } from "../lib/rateLimit.js";
import { getPrisma } from "../lib/prisma.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const rl = checkRateLimit(event, {
    windowMs: 5 * 60 * 1000,
    max: 30,
    key: "conversation-end",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  if (!conversationId) {
    return json(400, { error: "missing_conversation_id" });
  }

  // Allow caller to pass a reason for telemetry; not stored in the DB but
  // logged server-side alongside the row update.
  const reason =
    typeof payload.reason === "string" ? payload.reason.slice(0, 200) : null;

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: "ended",
        endTime: new Date(),
      },
    });
    if (reason) {
      console.log(
        JSON.stringify({
          event: "conversation_ended",
          conversationId,
          reason,
          ts: new Date().toISOString(),
        }),
      );
    }
    return json(200, {
      id: conversation.id,
      status: conversation.status,
      endTime: conversation.endTime,
      totalMessages: conversation.totalMessages,
    });
  } catch (err) {
    if (err?.code === "P2025") {
      return json(404, { error: "conversation_not_found" });
    }
    console.error("conversation-end failed", err);
    return json(500, { error: "db_error", message: String(err?.message || err) });
  }
};
