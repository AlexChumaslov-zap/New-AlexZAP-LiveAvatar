// Single-conversation report pipeline.
//
// Used by both the 4-hour cron (adminCronReports) and the on-session-end
// trigger (processConversationReports Lambda) so the logic lives in one place.
//
// processConversation(prisma, conversation) — conversation must be loaded with
// { visitor: true, messages: { orderBy: { timestamp: "asc" } } }.
//
// Returns: 'deleted_agent_only' | 'deleted_junk' | 'ai_failed' | 'saved'

import {
  formatConversationForAI,
  analyzeConversation,
} from "./openai-service.js";
import {
  formatPayload,
  isHubspotConfigured,
  pushLeadToHubspot,
} from "./hubspot-service.js";

export const REPORT_SECTIONS = [
  { key: "QualificationAssessment",    name: "Qualification Assessment Report" },
  { key: "RecommendedNextActions",     name: "Recommended Next Actions Report" },
  { key: "LeadPreQualificationReport", name: "Lead Pre-Qualification Report" },
  { key: "PainPointsReport",           name: "Pain Points Report" },
  { key: "AutomationReadinessReport",  name: "Automation Readiness Report" },
  { key: "TechStackReport",            name: "Tech Stack Report" },
  { key: "UserGoalsReport",            name: "User Goals Report" },
  { key: "CompetitiveLandscapeReport", name: "Competitive Landscape Report" },
  { key: "AdoptionBarriersReport",     name: "Adoption Barriers Report" },
  { key: "ROIPotentialReport",         name: "ROI Potential Report" },
  { key: "UseCaseReport",              name: "Use Case Report" },
  { key: "TechnicalExpertiseReport",   name: "Technical Expertise Report" },
];

export function hasValidData(data) {
  if (!data || typeof data !== "object") return false;
  if (Object.keys(data).length === 0) return false;
  return Object.values(data).some((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "object") return Object.keys(v).length > 0;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

export function dropNulls(data) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null));
}

function log(event, conversationId, extra = {}) {
  console.log(
    JSON.stringify({ event, conversationId, ...extra, ts: new Date().toISOString() }),
  );
}

export async function deleteConversation(prisma, id) {
  await prisma.$transaction([
    prisma.report.deleteMany({ where: { conversationId: id } }),
    prisma.message.deleteMany({ where: { conversationId: id } }),
    prisma.conversation.delete({ where: { id } }),
  ]);
}

async function pushToHubspot(prisma, conversation, reports, messages) {
  if (!isHubspotConfigured()) return;
  try {
    const payload = formatPayload(conversation, reports, messages);
    const { contactId, noteId } = await pushLeadToHubspot(payload);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "exported", updatedAt: new Date() },
    });
    log("process_hubspot_pushed", conversation.id, { contactId, noteId });
  } catch (err) {
    log("process_hubspot_failed", conversation.id, { error: String(err?.message || err) });
  }
}

export async function processConversation(prisma, conversation) {
  const { id, messages, visitorId } = conversation;

  const hasVisitorMsg = messages.some(
    (m) => m.sender === "visitor" || m.sender === "user",
  );
  if (!hasVisitorMsg) {
    await deleteConversation(prisma, id);
    log("process_deleted_agent_only", id, { messageCount: messages.length });
    return "deleted_agent_only";
  }

  let aiData;
  try {
    aiData = await analyzeConversation(formatConversationForAI(conversation));
  } catch (err) {
    log("process_report_failed", id, { error: String(err?.message || err) });
    return "ai_failed";
  }

  if (aiData?.JunkAssessment?.IsJunk === true) {
    await deleteConversation(prisma, id);
    log("process_deleted_junk", id, { reason: aiData.JunkAssessment.Reason });
    return "deleted_junk";
  }

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

  log("process_report_saved", id);

  const freshReports = await prisma.report.findMany({ where: { conversationId: id } });
  const freshConversation = await prisma.conversation.findUnique({
    where: { id },
    include: { visitor: true },
  });
  await pushToHubspot(prisma, freshConversation, freshReports, messages);

  return "saved";
}
