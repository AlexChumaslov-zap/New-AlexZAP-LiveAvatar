// POST /api/admin/conversations/bulk-end

import { getPrisma } from "../../../lib/prisma.js";
import { json, parseBody, method } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  const prisma = getPrisma();
  const now = new Date();

  try {
    let where;
    if (Array.isArray(payload.ids) && payload.ids.length > 0) {
      const ids = payload.ids
        .filter((id) => typeof id === "string")
        .slice(0, 500);
      if (ids.length === 0) return json(400, { error: "no_valid_ids" });
      where = { id: { in: ids } };
    } else {
      const minutes = Number.isFinite(Number(payload.staleOlderThanMin))
        ? Math.max(1, Number(payload.staleOlderThanMin))
        : 60;
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      where = { status: "active", startTime: { lt: cutoff } };
    }

    const result = await prisma.conversation.updateMany({
      where,
      data: { status: "ended", endTime: now },
    });

    console.log(
      JSON.stringify({
        event: "admin_conversations_bulk_ended",
        ended: result.count,
        ts: now.toISOString(),
      }),
    );
    return json(200, { ended: result.count });
  } catch (err) {
    console.error("admin-conversations-bulk-end failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
