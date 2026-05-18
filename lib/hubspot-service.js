// HubSpot CRM integration — upserts a Contact by email.
//
// Auth: HubSpot Private App bearer token (HUBSPOT_PRIVATE_APP_TOKEN).
// Required scopes (Private App → Settings → Integrations):
//   crm.objects.contacts.read
//   crm.objects.contacts.write
//
// The qualification summary (rating, next actions, pain points) is stored in
// the standard `description` contact property so sales reps see it without
// needing custom properties, deals, or notes.

const HS_BASE = "https://api.hubapi.com";

const LIFECYCLE_BY_RATING = {
  Hot: "salesqualifiedlead",
  Warm: "marketingqualifiedlead",
  Cold: "lead",
};

export function isHubspotConfigured() {
  return Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN);
}

async function hsFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => "");
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { res, data };
}

/** Upsert a Contact by email; returns the contact id. */
async function upsertContact(properties) {
  const { res, data } = await hsFetch(
    "/crm/v3/objects/contacts/batch/upsert",
    {
      method: "POST",
      body: {
        inputs: [{ idProperty: "email", id: properties.email, properties }],
      },
    },
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `HubSpot contact upsert failed: ${res.status} ${
        data?.message || JSON.stringify(data).slice(0, 200)
      }`,
    );
  }
  const result = data?.results?.[0];
  if (!result?.id) {
    throw new Error("HubSpot contact upsert returned no id");
  }
  return result.id;
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

/**
 * Shape a Prisma Conversation (with eager visitor) + its Report rows into
 * a HubSpot Contact properties object.
 *
 * Returns { contactProps }.
 */
export function formatPayload(conversation, reports) {
  const visitor = conversation.visitor || {};
  if (!visitor.email) {
    throw new Error(
      "HubSpot push requires a visitor email — the conversation has none.",
    );
  }

  let firstName = "";
  let lastName = "Unknown";
  if (visitor.name) {
    const parts = String(visitor.name).trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName =
      parts.length > 1 ? parts[parts.length - 1] : parts[0] || "Unknown";
  }

  // Index reports by name for easy lookup.
  const byName = {};
  for (const r of reports || []) {
    if (r?.name) byName[r.name.toLowerCase()] = r.reportData || {};
  }
  const qual = byName["qualification assessment report"] || {};
  const nextActions = byName["recommended next actions report"] || {};
  const leadQual = byName["lead pre-qualification report"] || {};
  const painPoints = byName["pain points report"] || {};
  const techStack = byName["tech stack report"] || {};

  const rating =
    qual.Rating === "Hot" || qual.Rating === "Warm" || qual.Rating === "Cold"
      ? qual.Rating
      : null;

  const contactProps = {
    email: visitor.email,
    ...(firstName ? { firstname: firstName.slice(0, 50) } : {}),
    lastname: lastName.slice(0, 50),
    company: (visitor.company || "Unknown").slice(0, 255),
  };

  if (rating) {
    contactProps.lifecyclestage = LIFECYCLE_BY_RATING[rating];
  }
  if (leadQual.Role) contactProps.jobtitle = asText(leadQual.Role).slice(0, 100);
  if (leadQual.Industry) contactProps.industry = asText(leadQual.Industry).slice(0, 100);
  const empCount = digitsOnly(leadQual.CompanySize);
  if (empCount) contactProps.numemployees = Math.round(empCount);
  const annualRevenue = digitsOnly(leadQual.Budget);
  if (annualRevenue) contactProps.annualrevenue = annualRevenue;

  // Build a plain-text summary for the standard `description` field so sales
  // reps can see the gist without needing custom properties or notes.
  const lines = [];
  if (rating) lines.push(`Qualification: ${rating}`);
  if (Array.isArray(nextActions.Actions) && nextActions.Actions.length > 0) {
    lines.push("Next actions: " + nextActions.Actions.join(" | "));
  }
  const challenges = asText(
    Array.isArray(painPoints.CurrentChallenges)
      ? painPoints.CurrentChallenges.join("; ")
      : painPoints.CurrentChallenges,
  );
  if (challenges) lines.push("Pain points: " + challenges);
  if (leadQual.Timeline) lines.push("Timeline: " + asText(leadQual.Timeline));
  const tools = asText(techStack.CurrentTools);
  if (tools) lines.push("Current tools: " + tools);
  lines.push(`Avatar conversation ID: ${conversation.id}`);

  contactProps.description = lines.join("\n");

  return { contactProps };
}

/**
 * Upsert a HubSpot Contact from the formatted payload.
 * Returns { contactId }.
 */
export async function pushLeadToHubspot({ contactProps }) {
  const contactId = await upsertContact(contactProps);
  return { contactId };
}
