// GET /api/admin/analytics — daily conversation counts for the last 14 days
// split into "current week" (last 7 including today) and "previous week"
// (the 7 before that). Returns totals + percent change so the UI can
// render two bar charts and a "+/-N% vs previous" badge.
//
// Window semantics fix vs AlexZAP: AlexZAP's logic put `today` at the end
// of the display array but excluded `today` from the count filter, so any
// conversations from today were silently dropped. We include today in the
// current window.

import { getPrisma } from "../../../lib/prisma.js";
import { json, method } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Build a 7-slot bucket array ending on `endDate` (inclusive). */
function buildWeekBuckets(endDate) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(endDate);
    d.setUTCDate(d.getUTCDate() - 6 + i);
    return {
      date: d.toISOString().slice(0, 10),
      day: DAY_NAMES[d.getUTCDay()],
      count: 0,
    };
  });
}

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // Today at UTC midnight (so buckets align with calendar days regardless
  // of when the function runs).
  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const currentEnd = todayUtc; // last bucket = today
  const currentStart = new Date(currentEnd.getTime() - 6 * MS_PER_DAY);
  const previousEnd = new Date(currentStart.getTime() - MS_PER_DAY);
  const previousStart = new Date(previousEnd.getTime() - 6 * MS_PER_DAY);

  // Cutoff for the SQL fetch: include the entire previous-week start day.
  // (We fetch slightly more than 14 days of UTC-midnight-aligned data, then
  // bucket each conversation into its calendar day.)
  const fetchFrom = previousStart;

  try {
    const prisma = getPrisma();
    const conversations = await prisma.conversation.findMany({
      where: { startTime: { gte: fetchFrom } },
      select: { startTime: true },
      orderBy: { startTime: "asc" },
    });

    const currentBuckets = buildWeekBuckets(currentEnd);
    const previousBuckets = buildWeekBuckets(previousEnd);

    for (const c of conversations) {
      const d = new Date(c.startTime);
      const dateStr = d.toISOString().slice(0, 10);
      const cur = currentBuckets.find((b) => b.date === dateStr);
      if (cur) {
        cur.count++;
        continue;
      }
      const prev = previousBuckets.find((b) => b.date === dateStr);
      if (prev) prev.count++;
    }

    const currentTotal = currentBuckets.reduce((s, b) => s + b.count, 0);
    const previousTotal = previousBuckets.reduce((s, b) => s + b.count, 0);
    const percentChange =
      previousTotal === 0
        ? currentTotal > 0
          ? 100
          : 0
        : Math.round(((currentTotal - previousTotal) / previousTotal) * 100);

    return json(
      200,
      {
        current: currentBuckets,
        previous: previousBuckets,
        currentTotal,
        previousTotal,
        percentChange,
        windowsUtc: {
          current: { from: currentStart.toISOString(), to: currentEnd.toISOString() },
          previous: { from: previousStart.toISOString(), to: previousEnd.toISOString() },
        },
      },
      { "cache-control": "no-store" },
    );
  } catch (err) {
    console.error("admin-analytics failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
