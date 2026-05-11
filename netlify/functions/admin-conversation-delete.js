// DELETE /api/admin/conversations/:id — cascade-delete a conversation row,
// its messages, and its reports. Follows AlexZAP's delete order:
// reports → messages → conversation (FK constraints require this).

import { getPrisma } from "../lib/prisma.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "DELETE" && event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const id =
    event.queryStringParameters?.id || event.path?.split("/").filter(Boolean).pop();
  if (!id) return json(400, { error: "missing_id" });

  try {
    const prisma = getPrisma();
    await prisma.$transaction([
      prisma.report.deleteMany({ where: { conversationId: id } }),
      prisma.message.deleteMany({ where: { conversationId: id } }),
      prisma.conversation.delete({ where: { id } }),
    ]);
    console.log(
      JSON.stringify({
        event: "admin_conversation_deleted",
        conversationId: id,
        ts: new Date().toISOString(),
      }),
    );
    return json(200, { ok: true, deletedId: id });
  } catch (err) {
    if (err?.code === "P2025") return json(404, { error: "conversation_not_found" });
    console.error("admin-conversation-delete failed", err);
    return json(500, { error: "db_error", message: String(err?.message || err) });
  }
};
