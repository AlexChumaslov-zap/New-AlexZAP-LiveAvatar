// POST /api/admin/conversations/:id/push-salesforce
//
// Creates a Salesforce Lead from the conversation + its reports, and on
// success marks the conversation `status: "exported"` (matches AlexZAP's
// behavior — used by the list-filter chips).
//
// Phase G manual button only. Auto-push under FEATURE_AUTO_CRM is deferred.
//
// 503 when SALESFORCE_* env vars are missing — same pattern as Phase F's
// admin-reports-generate when OPENAI_API_KEY is unset, so the UI can show a
// clean "not configured" message instead of a 500.

import { getPrisma } from "../lib/prisma.js";
import {
  formatLeadData,
  isSalesforceConfigured,
  pushLeadToSalesforce,
} from "../lib/salesforce-service.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const conversationId =
    event.queryStringParameters?.id ||
    (() => {
      try {
        return JSON.parse(event.body || "{}").conversationId || null;
      } catch {
        return null;
      }
    })();
  if (!conversationId) return json(400, { error: "missing_conversation_id" });

  if (!isSalesforceConfigured()) {
    return json(503, { error: "salesforce_not_configured" });
  }

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { visitor: true },
    });
    if (!conversation) return json(404, { error: "conversation_not_found" });

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
