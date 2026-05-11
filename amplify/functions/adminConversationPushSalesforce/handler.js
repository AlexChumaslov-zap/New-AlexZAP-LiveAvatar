// POST /api/admin/conversations/{id}/push-salesforce.
// Creates a Salesforce Lead, marks conversation `status: "exported"` on success.

import { getPrisma } from "../../../lib/prisma.js";
import {
  formatLeadData,
  isSalesforceConfigured,
  pushLeadToSalesforce,
} from "../../../lib/salesforce-service.js";
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
  if (!isSalesforceConfigured()) {
    return json(503, { error: "salesforce_not_configured" });
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

    const leadData = formatLeadData(conversation, reports);
    const { leadId } = await pushLeadToSalesforce(leadData);

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "exported", updatedAt: new Date() },
    });

    console.log(
      JSON.stringify({
        event: "admin_salesforce_pushed",
        conversationId,
        leadId,
        ts: new Date().toISOString(),
      }),
    );
    return json(200, { ok: true, leadId });
  } catch (err) {
    console.error("admin-conversation-push-salesforce failed", err);
    return json(500, {
      error: "salesforce_push_failed",
      message: String(err?.message || err),
    });
  }
};
