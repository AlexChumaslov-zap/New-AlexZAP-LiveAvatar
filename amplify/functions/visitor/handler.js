// POST /api/visitor — create or update a Visitor row.

import {
  checkRateLimit,
  rateLimitedResponse,
} from "../../../lib/rateLimit.js";
import { getPrisma } from "../../../lib/prisma.js";
import { json, parseBody, method } from "../../../lib/lambda.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX = 200;

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
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  const rl = checkRateLimit(event, {
    windowMs: 5 * 60 * 1000,
    max: 30,
    key: "visitor",
  });
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter);

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  const name = clean(payload.name);
  const email = clean(payload.email);
  const company = clean(payload.company);
  const existingId = clean(payload.existingId);

  if (email && !EMAIL_REGEX.test(email)) {
    return json(400, { error: "invalid_email" });
  }

  const prisma = getPrisma();
  try {
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
        if (err?.code === "P2002" && email) {
          // The email is already on a different visitor. Reassign all
          // conversations from the current anonymous visitor to the
          // email-matched one, then remove the now-orphaned anonymous record.
          const emailVisitor = await prisma.visitor.findUnique({
            where: { email },
          });
          if (emailVisitor) {
            await prisma.conversation.updateMany({
              where: { visitorId: existingId },
              data: { visitorId: emailVisitor.id },
            });
            // Best-effort deletion — silently skip if the row is already gone.
            await prisma.visitor.delete({ where: { id: existingId } }).catch(
              () => {},
            );
            const merged = await prisma.visitor.update({
              where: { id: emailVisitor.id },
              data: {
                lastVisit: new Date(),
                ...(name ? { name } : {}),
                ...(company ? { company } : {}),
              },
            });
            return json(200, shape(merged));
          }
        }
        if (err?.code !== "P2025") throw err;
      }
    }
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
