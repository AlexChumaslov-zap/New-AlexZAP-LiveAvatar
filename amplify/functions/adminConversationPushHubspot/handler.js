// POST /api/admin/conversations/{id}/push-hubspot
//
// Creates (or updates) a HubSpot Contact from the conversation + reports,
// creates an associated Deal, and attaches an HTML Note summarizing the
// conversation. On success, marks the conversation `status: "exported"`.
//
// Replaces the previous Salesforce push (Phase G.2). 503 when
// HUBSPOT_PRIVATE_APP_TOKEN env var is missing, matching the same shape
// as the OpenAI reports endpoint.

import { getPrisma } from "../../../lib/prisma.js";
import {
  formatPayload,
  isHubspotConfigured,
  pushLeadToHubspot,
} from "../../../lib/hubspot-service.js";
import { json, parseBody, method, pathParam } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

export const handler = async (event) => {
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const idFromPath = pathParam(event, "id");
  const idFromBody = parseBody(event)?.conversationId;
  const conversationId =
    (typeof idFromPath === "string" && idFromPath) || idFromBody || null;
  if (!conversationId) {
    return json(400, { error: "missing_conversation_id" });
  }
  if (!isHubspotConfigured()) {
    return json(503, { error: "hubspot_not_configured" });
  }

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { visitor: true },
    });
    if (!conversation) {
      return json(404, { error: "conversation_not_found" });
    }
    const reports = await prisma.report.findMany({
      where: { conversationId },
    });

    let payload;
    try {
      payload = formatPayload(conversation, reports);
    } catch (err) {
      // Most likely: visitor missing email (HubSpot dedupe key).
      return json(422, {
        error: "payload_invalid",
        message: String(err?.message || err),
      });
    }

    const { contactId, dealId, noteId } = await pushLeadToHubspot(payload);

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "exported", updatedAt: new Date() },
    });

    console.log(
      JSON.stringify({
        event: "admin_hubspot_pushed",
        conversationId,
        contactId,
        dealId,
        noteId,
        ts: new Date().toISOString(),
      }),
    );
    return json(200, { ok: true, contactId, dealId, noteId });
  } catch (err) {
    console.error("admin-conversation-push-hubspot failed", err);
    return json(500, {
      error: "hubspot_push_failed",
      message: String(err?.message || err),
    });
  }
};
