// Async Lambda — invoked by conversationEnd (fire-and-forget) immediately
// after a session ends. Runs the full single-conversation pipeline:
// analyse with OpenAI → junk check → save reports → HubSpot push.
//
// Idempotent: skips if reports already exist (cron ran first, or duplicate
// invocation via Lambda's built-in async retry).

import { getPrisma } from "../../../lib/prisma.js";
import { processConversation } from "../../../lib/processConversationReports.js";

export const handler = async (event) => {
  const conversationId =
    typeof event?.conversationId === "string" ? event.conversationId : null;
  if (!conversationId) return;

  const prisma = getPrisma();

  const existing = await prisma.report.count({ where: { conversationId } });
  if (existing > 0) {
    console.log(
      JSON.stringify({
        event: "process_skip_existing",
        conversationId,
        ts: new Date().toISOString(),
      }),
    );
    return;
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      visitor: true,
      messages: { orderBy: { timestamp: "asc" } },
    },
  });
  if (!conversation) return;

  const result = await processConversation(prisma, conversation);
  console.log(
    JSON.stringify({
      event: "process_completed",
      conversationId,
      result,
      ts: new Date().toISOString(),
    }),
  );
};
