// POST /api/conversation/message — append a Message + increment count.
// Frontend role 'user'/'avatar' maps to wire format 'visitor'/'bot'.

import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { getPrisma } from "../../../lib/prisma.js";
import { json, parseBody, method } from "../../../lib/lambda.js";

const MAX_TEXT = 5000;

export const handler = async (event) => {
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const rl = checkRateLimit(event, {
    windowMs: 60 * 1000,
    max: 120,
    key: "conversation-message",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  const role =
    payload.role === "user"
      ? "user"
      : payload.role === "avatar"
        ? "avatar"
        : null;
  const text = typeof payload.text === "string" ? payload.text : null;

  if (!conversationId) return json(400, { error: "missing_conversation_id" });
  if (!role) return json(400, { error: "invalid_role" });
  if (!text || !text.trim()) return json(400, { error: "missing_text" });
  if (text.length > MAX_TEXT) return json(400, { error: "text_too_long" });

  const sender = role === "user" ? "visitor" : "bot";

  try {
    const prisma = getPrisma();
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId, sender, messageText: text.slice(0, MAX_TEXT) },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { totalMessages: { increment: 1 } },
      }),
    ]);
    return json(200, {
      id: message.id,
      conversationId: message.conversationId,
      sender: message.sender,
      timestamp: message.timestamp,
    });
  } catch (err) {
    if (err?.code === "P2025") {
      return json(404, { error: "conversation_not_found" });
    }
    console.error("conversation-message failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
