// POST /api/admin/reports/generate — OpenAI Responses API → Report rows.

import { getPrisma } from "../../../lib/prisma.js";
import {
  formatConversationForAI,
  analyzeConversation,
} from "../../../lib/openai-service.js";
import { json, parseBody, method } from "../../../lib/lambda.js";
import { requireAdmin } from "../../../lib/adminAuth.js";

// Order matters — sections are inserted as separate Report rows in this
// order, and the detail UI lists them top-down. Triage-critical sections
// (Qualification + NextActions) come first so admins see them without
// scrolling.
const REPORT_SECTIONS = [
  { key: "QualificationAssessment", name: "Qualification Assessment Report" },
  { key: "RecommendedNextActions", name: "Recommended Next Actions Report" },
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
  const blocked = requireAdmin(event);
  if (blocked) return blocked;
  if (method(event) !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const payload = parseBody(event);
  if (payload === null) return json(400, { error: "invalid_json" });

  const conversationId =
    typeof payload.conversationId === "string" ? payload.conversationId : null;
  if (!conversationId) {
    return json(400, { error: "missing_conversation_id" });
  }

  try {
    const prisma = getPrisma();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        visitor: true,
        messages: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!conversation) {
      return json(404, { error: "conversation_not_found" });
    }
    if (conversation.messages.length === 0) {
      return json(400, { error: "no_messages_to_analyze" });
    }

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
