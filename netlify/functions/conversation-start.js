// POST /api/conversation/start — create a new Conversation row tied to a
// Visitor. Returns { id } so the frontend can carry it through the session
// and pass it to /api/conversation/message and /api/conversation/end.

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
    max: 20,
    key: "conversation-start",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const visitorId =
    typeof payload.visitorId === "string" ? payload.visitorId : null;
  if (!visitorId) {
    return json(400, { error: "missing_visitor_id" });
  }

  try {
    const prisma = getPrisma();
    // Verify visitor exists; reject early on bad client data.
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitor) {
      return json(404, { error: "visitor_not_found" });
    }
    const conversation = await prisma.conversation.create({
      data: { visitorId, status: "active" },
    });
    return json(200, {
      id: conversation.id,
      visitorId: conversation.visitorId,
      startTime: conversation.startTime,
      status: conversation.status,
    });
  } catch (err) {
    console.error("conversation-start failed", err);
    return json(500, { error: "db_error", message: String(err?.message || err) });
  }
};
