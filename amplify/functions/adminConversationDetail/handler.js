// GET /api/admin/conversations/{id} — full detail.

import { getPrisma } from "../../../lib/prisma.js";
import { json, method, pathParam } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = pathParam(event, "id");
  if (!id) return json(400, { error: "missing_id" });

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

    return json(
      200,
      {
        conversation: { ...conversation, durationMs },
        messages,
        reports,
      },
      { "cache-control": "no-store" },
    );
  } catch (err) {
    console.error("admin-conversation-detail failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
