// POST /api/admin/conversations/{id}/end (idempotent).

import { getPrisma } from "../../../lib/prisma.js";
import { json, method, pathParam } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = pathParam(event, "id");
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
    if (err?.code === "P2025") {
      return json(404, { error: "conversation_not_found" });
    }
    console.error("admin-conversation-end failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
