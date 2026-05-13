// OpenAI Responses API integration.
//
// Replaces the previous Assistants API implementation (deprecated by OpenAI
// — see https://developers.openai.com/api/docs/guides/migrate-to-responses).
// The Responses API does not use a pre-configured Assistant ID; the system
// prompt is sent inline with each request.
//
// Required env vars:
//   OPENAI_API_KEY      — API key from https://platform.openai.com/api-keys
// Optional:
//   OPENAI_REPORT_MODEL — defaults to "gpt-4o-mini"

import OpenAI from "openai";

let _openai;
function client() {
  if (!_openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Lead-qualification prompt — was previously configured on the OpenAI
// Assistant in the dashboard, now embedded in code so deployments are
// self-contained. Edit this string to tune the analysis behavior.
const REPORT_SYSTEM_PROMPT = `You are a sales and marketing analyst reviewing a transcript between a website visitor and an AI avatar that qualifies leads for an automation/AI consulting business.

Analyze the conversation and produce a structured JSON report. Only include sections for which the conversation provides at least one signal — omit a section entirely when there is no relevant evidence. Never fabricate facts.

Return a single JSON object. The first two sections — QualificationAssessment and RecommendedNextActions — should always be produced (they drive sales triage downstream). The rest are optional: omit a section entirely when the conversation provides no relevant evidence. Never fabricate facts.

Top-level keys:

- QualificationAssessment: { Rating: "Hot" | "Warm" | "Cold" }
    Rate the lead's strength as a sales opportunity:
    - "Hot" — visitor has clear pain, budget signals, decision authority, and near-term timeline.
    - "Warm" — visitor has 1-2 strong signals but is missing one of pain / budget / authority / timeline.
    - "Cold" — visitor is information-gathering only, no clear buying intent, or signals are weak/absent.
    When in doubt, default to "Cold". Output ONLY one of those three strings.
- RecommendedNextActions: { Actions: [string] }
    A short ordered list (typically 2-5 items) of specific next steps for the sales team. Each action should be concrete and start with a verb. Example: "Email the decision-maker referencing their stated pain point with healthcare data routing."

- LeadPreQualificationReport: { Name, Company, Email, Role, Industry, CompanySize, Budget, Timeline, DecisionMaker, Notes }
- PainPointsReport: { CurrentChallenges, ImpactOnBusiness, UrgencyLevel, RootCauses }
- AutomationReadinessReport: { CurrentAutomation, ReadinessLevel, BlockingFactors, EnablingFactors }
- TechStackReport: { CurrentTools, Integrations, GapsIdentified, ReplacementCandidates }
- UserGoalsReport: { ShortTermGoals, LongTermGoals, SuccessCriteria, KPIs }
- CompetitiveLandscapeReport: { CompetitorsMentioned, CompetitiveAdvantages, DifferentiationOpportunities }
- AdoptionBarriersReport: { TechnicalBarriers, OrganizationalBarriers, FinancialBarriers, MitigationStrategies }
- ROIPotentialReport: { EstimatedTimeSavings, EstimatedCostSavings, RevenueImpact, PaybackPeriod }
- UseCaseReport: { PrimaryUseCases, SecondaryUseCases, Workflows, ExpectedOutcomes }
- TechnicalExpertiseReport: { Level, Specializations, Gaps }

Field values may be strings or arrays of strings. Use null for a field with no information rather than guessing. Output strictly valid JSON — no markdown fences, no commentary.`;

/**
 * Submit a conversation to the Responses API and return the parsed JSON
 * report. Throws on any failure (caller is responsible for HTTP error mapping).
 */
export async function analyzeConversation(conversationData) {
  const openai = client();
  const model = process.env.OPENAI_REPORT_MODEL || "gpt-4o-mini";

  // OpenAI's `text.format: json_object` validation requires the literal
  // word "json" to appear in the `input` field, not just in `instructions`.
  // Prefix the conversation payload with an instruction line so the
  // validator passes regardless of payload contents.
  const input = `Analyze the following conversation and return the structured JSON report described in the system instructions.\n\n${JSON.stringify(conversationData)}`;

  const response = await openai.responses.create({
    model,
    instructions: REPORT_SYSTEM_PROMPT,
    input,
    text: { format: { type: "json_object" } },
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("empty response from OpenAI Responses API");
  }

  // json_object format guarantees valid JSON, but strip an accidental fence
  // defensively in case the model decorates the output anyway.
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenced ? fenced[1] : text;
  return JSON.parse(jsonStr);
}

/**
 * Shape a Prisma Conversation (with visitor + messages eagerly loaded) into
 * the payload the model expects.
 */
export function formatConversationForAI(conversation) {
  return {
    id: conversation.id,
    visitorInfo: {
      name: conversation.visitor?.name ?? null,
      company: conversation.visitor?.company ?? null,
      email: conversation.visitor?.email ?? null,
      firstVisit: conversation.visitor?.firstVisit ?? null,
      lastVisit: conversation.visitor?.lastVisit ?? null,
    },
    startTime: conversation.startTime,
    endTime: conversation.endTime,
    status: conversation.status,
    totalMessages: conversation.totalMessages,
    messages: (conversation.messages || []).map((m) => ({
      role: m.sender === "visitor" || m.sender === "user" ? "user" : "assistant",
      content: m.messageText,
      timestamp: m.timestamp,
    })),
  };
}
