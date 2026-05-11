// POST /api/admin/conversations/:id/end — admin-triggered "end conversation"
// (sets status='ended', stamps end_time). Idempotent.

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
  const id =
    event.queryStringParameters?.id || event.path?.split("/").filter(Boolean).pop();
  if (!id) return json(400, { error: "missing_id" });

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.update({
      where: { id },
      data: { status: "ended", endTime: new Date() },
    });
    console.log(
      JSON.stringify({
        event: "admin_conversation_ended",
        conversationId: id,
        ts: new Date().toISOString(),
      }),
    );
    return json(200, {
      id: conversation.id,
      status: conversation.status,
      endTime: conversation.endTime,
    });
  } catch (err) {
    if (err?.code === "P2025") return json(404, { error: "conversation_not_found" });
    console.error("admin-conversation-end failed", err);
    return json(500, { error: "db_error", message: String(err?.message || err) });
  }
};
