// Scheduled cron — runs every 4 h via EventBridge.
//
// For each conversation without reports (up to BATCH_SIZE per run):
//   1. Agent-only (no visitor messages) → delete.
//   2. Call OpenAI to generate report.
//   3. JunkAssessment.IsJunk === true → delete.
//   4. Save report rows to DB, update visitor name/company.
//   5. Visitor has an email → push Contact + Deal + Note to HubSpot.
//
// Additionally, any conversation that already has reports but hasn't been
// exported yet is pushed to HubSpot (no new AI call needed).

import { getPrisma } from "../../../lib/prisma.js";
import {
  formatConversationForAI,
  analyzeConversation,
} from "../../../lib/openai-service.js";
import {
  formatPayload,
  isHubspotConfigured,
  pushLeadToHubspot,
} from "../../../lib/hubspot-service.js";

const BATCH_SIZE = 20;

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
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
}

function log(event, conversationId, extra = {}) {
  console.log(
    JSON.stringify({ event, conversationId, ...extra, ts: new Date().toISOString() }),
  );
}

async function deleteConversation(prisma, id) {
  await prisma.$transaction([
    prisma.report.deleteMany({ where: { conversationId: id } }),
    prisma.message.deleteMany({ where: { conversationId: id } }),
    prisma.conversation.delete({ where: { id } }),
  ]);
}

async function pushToHubspot(prisma, conversation, reports) {
  if (!isHubspotConfigured()) return;
  try {
    const payload = formatPayload(conversation, reports);
    const { contactId } = await pushLeadToHubspot(payload);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "exported", updatedAt: new Date() },
    });
    log("cron_hubspot_pushed", conversation.id, { contactId });
  } catch (err) {
    log("cron_hubspot_failed", conversation.id, { error: String(err?.message || err) });
  }
}

export const handler = async () => {
  const prisma = getPrisma();
  let aiCallCount = 0;

  // ── Step 1: conversations with no reports ───────────────────────────────
  const unreported = await prisma.conversation.findMany({
    where: { reports: { none: {} } },
    include: {
      visitor: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
    orderBy: { startTime: "asc" },
    take: BATCH_SIZE,
  });

  for (const conversation of unreported) {
    const { id, messages, visitorId } = conversation;

    // Delete if no visitor ever sent a message.
    const hasVisitorMsg = messages.some(
      (m) => m.sender === "visitor" || m.sender === "user",
    );
    if (!hasVisitorMsg) {
      await deleteConversation(prisma, id);
      log("cron_deleted_agent_only", id, { messageCount: messages.length });
      continue;
    }

    // Generate AI report.
    let aiData;
    try {
      aiData = await analyzeConversation(formatConversationForAI(conversation));
      aiCallCount++;
    } catch (err) {
      log("cron_report_failed", id, { error: String(err?.message || err) });
      continue;
    }

    // Delete junk conversations.
    if (aiData?.JunkAssessment?.IsJunk === true) {
      await deleteConversation(prisma, id);
      log("cron_deleted_junk", id, { reason: aiData.JunkAssessment.Reason });
      continue;
    }

    // Save report rows.
    await prisma.report.deleteMany({ where: { conversationId: id } });
    for (const section of REPORT_SECTIONS) {
      const raw = aiData[section.key];
      if (!hasValidData(raw)) continue;
      const filtered = dropNulls(raw);
      if (Object.keys(filtered).length === 0) continue;
      await prisma.report.create({
        data: { name: section.name, reportData: filtered, conversationId: id },
      });
    }

    // Back-fill visitor name/company from AI if not already set.
    const lead = aiData.LeadPreQualificationReport;
    if (lead) {
      const update = {};
      if (!conversation.visitor?.name && typeof lead.Name === "string" && lead.Name.trim()) {
        update.name = lead.Name.trim().slice(0, 200);
      }
      if (!conversation.visitor?.company && typeof lead.Company === "string" && lead.Company.trim()) {
        update.company = lead.Company.trim().slice(0, 200);
      }
      if (Object.keys(update).length > 0) {
        await prisma.visitor.update({ where: { id: visitorId }, data: update });
      }
    }

    log("cron_report_saved", id);

    // Push to HubSpot if we have an email.
    const freshReports = await prisma.report.findMany({
      where: { conversationId: id },
    });
    // Reload conversation to pick up any visitor updates we just applied.
    const freshConversation = await prisma.conversation.findUnique({
      where: { id },
      include: { visitor: true },
    });
    await pushToHubspot(prisma, freshConversation, freshReports);
  }

  // ── Step 2: already-reported conversations not yet in HubSpot ───────────
  const pendingExport = await prisma.conversation.findMany({
    where: {
      reports: { some: {} },
      status: { not: "exported" },
    },
    include: { visitor: true },
    take: BATCH_SIZE,
  });

  for (const conversation of pendingExport) {
    const reports = await prisma.report.findMany({
      where: { conversationId: conversation.id },
    });
    await pushToHubspot(prisma, conversation, reports);
  }

  log("cron_completed", null, {
    unreportedProcessed: unreported.length,
    aiCalls: aiCallCount,
    pendingExportProcessed: pendingExport.length,
  });
};
