// POST /api/admin/reports/generate
// Body: { conversationId: string }
//
// Loads the conversation + messages + visitor, sends them to the OpenAI
// Responses API, parses the JSON response into one or more named Report
// rows, and stores them.
//
// On a re-run (existing reports present), the old reports are deleted first
// so the conversation always shows the latest analysis. Matches AlexZAP's
// behavior in app/api/reports/generate/route.ts.

import { getPrisma } from "../lib/prisma.js";
import {
  formatConversationForAI,
  analyzeConversation,
} from "../lib/openai-service.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// The Assistant's prompt is configured to return JSON with these top-level
// keys. We map each present key to a named Report row (preserving AlexZAP's
// naming so a future admin UI can render them with the right layout).
const REPORT_SECTIONS = [
  { key: "LeadPreQualificationReport", name: "Lead Pre-Qualification Report" },
  { key: "PainPointsReport", name: "Pain Points Report" },
  { key: "AutomationReadinessReport", name: "Automation Readiness Report" },
  { key: "TechStackReport", name: "Tech Stack Report" },
  { key: "UserGoalsReport", name: "User Goals Report" },
  { key: "CompetitiveLandscapeReport", name: "Competitive Landscape Report" },
  { key: "AdoptionBarriersReport", name: "Adoption Barriers Report" },
  { key: "ROIPotentialReport", name: "ROI Potential Report" },
  { key: "UseCaseReport", name: "Use Case Report" },
  { key: "TechnicalExpertiseReport", name: "Technical Expertise Report" },
];

function hasValidData(data) {
  if (!data || typeof data !== "object") return false;
  if (Object.keys(data).length === 0) return false;
  return Object.values(data).some((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

function dropNulls(data) {
  return Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== null),
  );
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  if (!conversationId) return json(400, { error: "missing_conversation_id" });

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        visitor: true,
        messages: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!conversation) return json(404, { error: "conversation_not_found" });
    if (conversation.messages.length === 0) {
      return json(400, { error: "no_messages_to_analyze" });
    }

    // Clear any prior reports so the conversation always shows the latest.
    await prisma.report.deleteMany({ where: { conversationId } });

    const aiData = await analyzeConversation(
      formatConversationForAI(conversation),
    );
    if (!aiData || typeof aiData !== "object") {
      return json(502, { error: "ai_returned_no_data" });
    }

    const savedReports = [];
    for (const section of REPORT_SECTIONS) {
      const raw = aiData[section.key];
      if (!hasValidData(raw)) continue;
      const filtered = dropNulls(raw);
      if (Object.keys(filtered).length === 0) continue;
      const r = await prisma.report.create({
        data: {
          name: section.name,
          reportData: filtered,
          conversationId,
        },
      });
      savedReports.push(r);
    }

    // If the Assistant returned data that doesn't match any known section,
    // save the whole blob as a generic report rather than dropping it.
    if (savedReports.length === 0 && hasValidData(aiData)) {
      const r = await prisma.report.create({
        data: {
          name: "Conversation Analysis Report",
          reportData: dropNulls(aiData),
          conversationId,
        },
      });
      savedReports.push(r);
    }

    // If LeadPreQualification surfaced a name/company that's better than what
    // we have on the visitor, take it (matches AlexZAP behavior).
    const lead = aiData.LeadPreQualificationReport;
    if (lead && (lead.Name || lead.Company)) {
      const update = {};
      if (typeof lead.Name === "string" && lead.Name.trim()) {
        update.name = lead.Name.trim().slice(0, 200);
      }
      if (typeof lead.Company === "string" && lead.Company.trim()) {
        update.company = lead.Company.trim().slice(0, 200);
      }
      if (Object.keys(update).length > 0) {
        await prisma.visitor.update({
          where: { id: conversation.visitorId },
          data: update,
        });
      }
    }

    console.log(
      JSON.stringify({
        event: "admin_reports_generated",
        conversationId,
        count: savedReports.length,
        ts: new Date().toISOString(),
      }),
    );

    return json(200, { reports: savedReports });
  } catch (err) {
    console.error("admin-reports-generate failed", err);
    return json(500, {
      error: "generation_failed",
      message: String(err?.message || err),
    });
  }
};
