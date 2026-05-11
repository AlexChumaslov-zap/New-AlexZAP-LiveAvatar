// GET /api/admin/conversations — paginated, sortable, filterable list.

import { getPrisma } from "../../../lib/prisma.js";
import { json, method } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

function clampInt(v, min, max, fallback) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const VALID_SORT_KEYS = {
  startTime: "startTime",
  totalMessages: "totalMessages",
  status: "status",
};
const VALID_STATUSES = new Set(["active", "ended", "exported"]);

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const q = event.queryStringParameters || {};
  const sortKey = VALID_SORT_KEYS[q.sort] || "startTime";
  const order = q.order === "asc" ? "asc" : "desc";
  const statusFilter = (q.status || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_STATUSES.has(s));
  const search =
    typeof q.search === "string" ? q.search.trim().slice(0, 200) : "";
  const page = clampInt(q.page, 1, 10_000, 1);
  const pageSize = clampInt(q.pageSize, 1, 200, 50);

  const where = {};
  if (statusFilter.length > 0) where.status = { in: statusFilter };
  if (search) {
    where.visitor = {
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { company: { contains: search } },
      ],
    };
  }

  try {
    const prisma = getPrisma();
    const [total, rows] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        include: {
          visitor: {
            select: { id: true, name: true, email: true, company: true },
          },
        },
        orderBy: { [sortKey]: order },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
    ]);

    const conversations = rows.map((c) => {
      const startMs = c.startTime ? new Date(c.startTime).getTime() : null;
      const endMs = c.endTime ? new Date(c.endTime).getTime() : null;
      const durationMs =
        startMs && endMs && endMs >= startMs ? endMs - startMs : null;
      return {
        id: c.id,
        startTime: c.startTime,
        endTime: c.endTime,
        totalMessages: c.totalMessages,
        status: c.status,
        durationMs,
        visitor: c.visitor,
      };
    });

    return json(
      200,
      { conversations, total, page, pageSize },
      { "cache-control": "no-store" },
    );
  } catch (err) {
    console.error("admin-conversations-list failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
