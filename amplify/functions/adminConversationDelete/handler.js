// DELETE/POST /api/admin/conversations/{id}/delete — cascade-delete.
// FK order: reports → messages → conversation.

import { getPrisma } from "../../../lib/prisma.js";
import { json, method, pathParam } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  const m = method(event);
  if (m !== "DELETE" && m !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const id = pathParam(event, "id");
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
    if (err?.code === "P2025") {
      return json(404, { error: "conversation_not_found" });
    }
    console.error("admin-conversation-delete failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
