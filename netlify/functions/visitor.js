// POST /api/visitor — create or update a Visitor row.
//
// Handles three modes via the request payload:
//   1. Anonymous create: `{}` → new row with name "Website Visitor", no email
//   2. Identified upsert: `{ name, email, company }` → upsert keyed on email
//   3. Update existing: `{ existingId, ...fields }` → update the row with that
//      DB id (used to upgrade an anonymous visitor once they share their info,
//      or to bump lastVisit on subsequent Talk clicks)
//
// In every mode, returns the canonical row { id, name, email, company,
// firstVisit, lastVisit }. The frontend persists the returned id and uses it
// when starting Conversation rows.

import { checkRateLimit, rateLimitedResponse } from "../lib/rateLimit.js";
import { getPrisma } from "../lib/prisma.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX = 200;

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function clean(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, MAX);
}

function shape(v) {
  return {
    id: v.id,
    name: v.name,
    email: v.email,
    company: v.company,
    firstVisit: v.firstVisit,
    lastVisit: v.lastVisit,
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const rl = checkRateLimit(event, {
    windowMs: 5 * 60 * 1000,
    max: 30,
    key: "visitor",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const name = clean(payload.name);
  const email = clean(payload.email);
  const company = clean(payload.company);
  const existingId = clean(payload.existingId);

  if (email && !EMAIL_REGEX.test(email)) {
    return json(400, { error: "invalid_email" });
  }

  const prisma = getPrisma();

  try {
    // Mode 3: update an existing row by id. Used when a previously-anonymous
    // visitor identifies themselves later, or we just want to refresh lastVisit.
    if (existingId) {
      const updateData = { lastVisit: new Date() };
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (company) updateData.company = company;
      try {
        const v = await prisma.visitor.update({
          where: { id: existingId },
          data: updateData,
        });
        return json(200, shape(v));
      } catch (err) {
        if (err?.code !== "P2025") throw err;
        // Row not found (e.g. stale client localStorage); fall through to
        // create a new one. Don't 404 — visitor records are best-effort.
      }
    }

    // Mode 2: upsert keyed on email (returning visitors with the same email
    // collapse into one row).
    if (email) {
      const v = await prisma.visitor.upsert({
        where: { email },
        update: {
          ...(name ? { name } : {}),
          ...(company ? { company } : {}),
          lastVisit: new Date(),
        },
        create: {
          name: name ?? "Website Visitor",
          email,
          company,
        },
      });
      return json(200, shape(v));
    }

    // Mode 1: anonymous create.
    const v = await prisma.visitor.create({
      data: { name: name ?? "Website Visitor" },
    });
    return json(200, shape(v));
  } catch (err) {
    console.error("visitor handler failed", err);
    return json(500, {
      error: "db_error",
      message: String(err?.message || err),
    });
  }
};
