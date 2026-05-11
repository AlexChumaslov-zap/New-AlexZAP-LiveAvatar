// Salesforce CRM integration — ported from AlexZAP's
// d:/Projects/AlexZAP_Interactive_Avatar-main/app/api/salesforce/lead/route.ts
//
// Authenticates with the OAuth 2.0 username-password flow against AlexZAP's
// existing Connected App, then POSTs a Lead to the data API. On a 401 from
// the data API we refresh the token once and retry.
//
// Field mapping uses the Responses-API report schema produced by
// netlify/lib/openai-service.js (LeadPreQualificationReport / PainPointsReport
// / TechStackReport top-level keys) — NOT AlexZAP's older camelCase shape.
//
// Required env vars:
//   SALESFORCE_CLIENT_ID
//   SALESFORCE_CLIENT_SECRET
//   SALESFORCE_USERNAME
//   SALESFORCE_PASSWORD       (password + security token, no separator)
// Optional:
//   SALESFORCE_LOGIN_URL      (defaults to https://login.salesforce.com)

const SF_API_VERSION = "v60.0";

function loginUrl() {
  return (
    process.env.SALESFORCE_LOGIN_URL || "https://login.salesforce.com"
  ).replace(/\/+$/, "");
}

export function isSalesforceConfigured() {
  return Boolean(
    process.env.SALESFORCE_CLIENT_ID &&
      process.env.SALESFORCE_CLIENT_SECRET &&
      process.env.SALESFORCE_USERNAME &&
      process.env.SALESFORCE_PASSWORD,
  );
}

/**
 * Fetch a Salesforce access token + instance URL via the username-password
 * OAuth flow. Returns null on failure (caller maps to HTTP error).
 */
async function getSalesforceToken() {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: process.env.SALESFORCE_CLIENT_ID || "",
    client_secret: process.env.SALESFORCE_CLIENT_SECRET || "",
    username: process.env.SALESFORCE_USERNAME || "",
    password: process.env.SALESFORCE_PASSWORD || "",
  });

  const res = await fetch(`${loginUrl()}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Salesforce token request failed: ${res.status} ${text || res.statusText}`,
    );
  }
  const data = await res.json();
  if (!data.access_token || !data.instance_url) {
    throw new Error("Salesforce token response missing access_token / instance_url");
  }
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}

/**
 * POST a Lead. On 401 we refresh the token once and retry.
 */
async function createLeadOnce(accessToken, instanceUrl, leadData) {
  const url = `${instanceUrl}/services/data/${SF_API_VERSION}/sobjects/Lead/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(leadData),
  });
  if (res.status === 201) {
    const data = await res.json().catch(() => ({}));
    return { ok: true, id: data.id || null };
  }
  if (res.status === 401) {
    return { ok: false, expired: true };
  }
  const text = await res.text().catch(() => "");
  return { ok: false, expired: false, status: res.status, message: text };
}

export async function pushLeadToSalesforce(leadData) {
  let token = await getSalesforceToken();
  let result = await createLeadOnce(token.accessToken, token.instanceUrl, leadData);
  if (!result.ok && result.expired) {
    token = await getSalesforceToken();
    result = await createLeadOnce(token.accessToken, token.instanceUrl, leadData);
  }
  if (!result.ok) {
    throw new Error(
      `Salesforce lead create failed: ${result.status || "?"} ${result.message || ""}`.trim(),
    );
  }
  return { leadId: result.id };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function asText(v) {
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof v === "string") return v.trim();
  return String(v);
}

function digitsOnly(v) {
  const s = asText(v).replace(/[^0-9.]/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function ratingFromUrgency(level) {
  const u = asText(level).toLowerCase();
  if (!u) return undefined;
  if (u.includes("high") || u.includes("urgent") || u.includes("critical")) {
    return "Hot";
  }
  if (u.includes("low")) return "Cold";
  return "Warm";
}

function truncate(s, n) {
  const str = asText(s);
  return str.length > n ? str.slice(0, n) : str || undefined;
}

/**
 * Map a Prisma Conversation (with eager visitor) + its Report rows to the
 * Salesforce Lead payload. Fields with no source data are omitted (not set
 * to null) so the Lead create doesn't fail on optional custom fields that
 * weren't populated.
 */
export function formatLeadData(conversation, reports) {
  const visitor = conversation.visitor || {};

  // Split visitor.name into first/last. Mirrors AlexZAP's heuristic: first
  // token → FirstName, last token → LastName, "Unknown" if name is missing.
  let firstName = "";
  let lastName = "Unknown";
  if (visitor.name) {
    const parts = String(visitor.name).trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "Unknown";
  }

  const leadData = {
    FirstName: truncate(firstName, 40),
    LastName: truncate(lastName, 80) || "Unknown",
    Company: truncate(visitor.company || "Unknown", 255),
    Email: visitor.email ? truncate(visitor.email, 80) : undefined,
    LeadSource: "Interactive Avatar",
    Status: "Open",
    Rating: "Warm",
    Description: `Lead generated from Interactive Avatar conversation (ID: ${conversation.id})`,
  };

  // Index reports by name so we can pull the structured AI output.
  const byName = {};
  for (const r of reports || []) {
    if (r?.name) byName[r.name.toLowerCase()] = r.reportData || {};
  }
  const leadQual = byName["lead pre-qualification report"] || {};
  const painPoints = byName["pain points report"] || {};
  const techStack = byName["tech stack report"] || {};

  if (leadQual.Role) {
    leadData.Title = truncate(leadQual.Role, 128);
  }
  if (leadQual.Industry) {
    leadData.Industry = truncate(leadQual.Industry, 40);
  }
  if (leadQual.CompanySize) {
    const n = digitsOnly(leadQual.CompanySize);
    if (n) leadData.NumberOfEmployees = Math.round(n);
  }
  if (leadQual.Budget) {
    const n = digitsOnly(leadQual.Budget);
    if (n) leadData.AnnualRevenue = n;
  }
  if (leadQual.Timeline) {
    leadData.Description += `\n\nTimeline: ${asText(leadQual.Timeline)}`;
  }
  if (leadQual.Notes) {
    leadData.Description += `\n\nNotes: ${asText(leadQual.Notes)}`;
  }

  if (painPoints.UrgencyLevel) {
    const r = ratingFromUrgency(painPoints.UrgencyLevel);
    if (r) leadData.Rating = r;
  }
  const challenges = asText(painPoints.CurrentChallenges);
  if (challenges) {
    leadData.PainPoints__c = truncate(challenges, 32000);
  }
  const impact = asText(painPoints.ImpactOnBusiness);
  if (impact) {
    leadData.Description += `\n\nImpact: ${impact}`;
  }

  const tools = asText(techStack.CurrentTools);
  if (tools) {
    leadData.Current_Tech_Stack__c = truncate(tools, 255);
  }

  // Trim Description so we never exceed Salesforce's 32k long-text limit.
  leadData.Description = truncate(leadData.Description, 32000);

  return leadData;
}
