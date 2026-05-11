// GET /api/admin/conversations — paginated, sortable, filterable list of
// conversations with their visitor joined.
//
// Auth: edge function `admin-auth` already gated /api/admin/*. By the time
// this handler runs the caller has passed Basic Auth.
//
// Query params:
//   sort      = startTime | totalMessages | status   (default: startTime)
//   order     = asc | desc                            (default: desc)
//   status    = comma-separated subset of: active, ended, exported
//   search    = case-insensitive substring on visitor name/email/company
//   page      = 1-based page index                    (default: 1)
//   pageSize  = rows per page                         (default: 50, max: 200)
//
// Response: { conversations: [...], total, page, pageSize }

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
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const q = event.queryStringParameters || {};

  const sortKey = VALID_SORT_KEYS[q.sort] || "startTime";
  const order = q.order === "asc" ? "asc" : "desc";

  const statusFilter = (q.status || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => VALID_STATUSES.has(s));

  const search = typeof q.search === "string" ? q.search.trim().slice(0, 200) : "";

  const page = clampInt(q.page, 1, 10_000, 1);
  const pageSize = clampInt(q.pageSize, 1, 200, 50);

  const where = {};
  if (statusFilter.length > 0) {
    where.status = { in: statusFilter };
  }
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
            select: {
              id: true,
              name: true,
              email: true,
              company: true,
            },
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

    return json(200, { conversations, total, page, pageSize });
  } catch (err) {
    console.error("admin-conversations-list failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
