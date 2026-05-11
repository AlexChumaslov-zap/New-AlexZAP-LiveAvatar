// GET /api/admin/conversations/:id — full detail: conversation row + visitor
// + all messages (ordered) + all reports (ordered).
//
// Auth: admin-auth edge function already gated /api/admin/*.

import { getPrisma } from "../lib/prisma.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id =
    event.queryStringParameters?.id || event.path?.split("/").pop();
  if (!id) {
    return json(400, { error: "missing_id" });
  }

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { visitor: true },
    });
    if (!conversation) {
      return json(404, { error: "conversation_not_found" });
    }

    const [messages, reports] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { timestamp: "asc" },
      }),
      prisma.report.findMany({
        where: { conversationId: id },
        orderBy: { generatedAt: "desc" },
      }),
    ]);

    const startMs = conversation.startTime
      ? new Date(conversation.startTime).getTime()
      : null;
    const endMs = conversation.endTime
      ? new Date(conversation.endTime).getTime()
      : null;
    const durationMs =
      startMs && endMs && endMs >= startMs ? endMs - startMs : null;

    return json(200, {
      conversation: { ...conversation, durationMs },
      messages,
      reports,
    });
  } catch (err) {
    console.error("admin-conversation-detail failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
