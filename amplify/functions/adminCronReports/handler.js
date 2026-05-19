// Scheduled cron — runs every 4 h via EventBridge.
//
// Catches anything missed by the on-session-end trigger:
//   • Conversations with no reports yet (up to BATCH_SIZE per run).
//   • Conversations that have reports but haven't been exported to HubSpot.
//
// Per-conversation logic lives in lib/processConversationReports.js and is
// shared with the processConversationReports Lambda.

import { getPrisma } from "../../../lib/prisma.js";
import { processConversation } from "../../../lib/processConversationReports.js";
import {
  formatPayload,
  isHubspotConfigured,
  pushLeadToHubspot,
} from "../../../lib/hubspot-service.js";

const BATCH_SIZE = 20;

function log(event, conversationId, extra = {}) {
  console.log(
    JSON.stringify({ event, conversationId, ...extra, ts: new Date().toISOString() }),
  );
}

async function pushToHubspot(prisma, conversation, reports, messages = []) {
  if (!isHubspotConfigured()) return;
  try {
    const payload = formatPayload(conversation, reports, messages);
    const { contactId, noteId } = await pushLeadToHubspot(payload);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "exported", updatedAt: new Date() },
    });
    log("cron_hubspot_pushed", conversation.id, { contactId, noteId });
  } catch (err) {
    log("cron_hubspot_failed", conversation.id, { error: String(err?.message || err) });
  }
}

export const handler = async () => {
  const prisma = getPrisma();

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

  const results = { saved: 0, deleted: 0, failed: 0 };
  for (const conversation of unreported) {
    const result = await processConversation(prisma, conversation);
    if (result === "saved") results.saved++;
    else if (result === "ai_failed") results.failed++;
    else results.deleted++;
  }

  // ── Step 2: already-reported conversations not yet in HubSpot ───────────
  const pendingExport = await prisma.conversation.findMany({
    where: {
      reports: { some: {} },
      status: { not: "exported" },
    },
    include: {
      visitor: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
    take: BATCH_SIZE,
  });

  for (const conversation of pendingExport) {
    const reports = await prisma.report.findMany({
      where: { conversationId: conversation.id },
    });
    await pushToHubspot(prisma, conversation, reports, conversation.messages);
  }

  log("cron_completed", null, {
    unreportedProcessed: unreported.length,
    ...results,
    pendingExportProcessed: pendingExport.length,
  });
};
