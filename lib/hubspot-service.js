// HubSpot CRM integration — replaces the Salesforce path. Pushes a
// Contact (upserted by email), a Deal associated to the Contact, and an
// HTML Note associated to both.
//
// Auth: HubSpot Private App bearer token (HUBSPOT_PRIVATE_APP_TOKEN).
// Generated in HubSpot → Settings → Integrations → Private Apps with these
// scopes:
//   crm.objects.contacts.{read,write}
//   crm.objects.deals.{read,write}
//   crm.objects.notes.write
//   crm.schemas.contacts.write    (for the custom-property creation below)
//
// Custom Contact properties (created defensively on first push if missing):
//   avatar_qualification_rating  — "Hot" | "Warm" | "Cold"
//   avatar_conversation_id       — the source conversation UUID
//
// Deal pipeline: HubSpot's default (`default` pipeline, `appointmentscheduled`
// stage). Override by hardcoding here if you have a custom "Avatar leads"
// pipeline.

const HS_BASE = "https://api.hubapi.com";
const DEAL_PIPELINE = "default";
const DEAL_STAGE = "appointmentscheduled";
// HubSpot internal association type IDs (HUBSPOT_DEFINED category).
const ASSOC_DEAL_TO_CONTACT = 3;
const ASSOC_NOTE_TO_CONTACT = 202;
const ASSOC_NOTE_TO_DEAL = 214;

const CUSTOM_PROPS = [
  {
    name: "avatar_qualification_rating",
    label: "Avatar Qualification Rating",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "Hot/Warm/Cold rating from the AI avatar conversation analysis.",
  },
  {
    name: "avatar_conversation_id",
    label: "Avatar Conversation ID",
    type: "string",
    fieldType: "text",
    groupName: "contactinformation",
    description: "UUID of the source conversation in the LiveAvatar admin.",
  },
];

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

/** Idempotently ensure our custom Contact properties exist. */
async function ensureCustomProperties() {
  for (const prop of CUSTOM_PROPS) {
    const { res, data } = await hsFetch("/crm/v3/properties/contacts", {
      method: "POST",
      body: prop,
    });
    if (res.status === 201) continue; // created
    if (res.status === 409) continue; // already exists — fine
    throw new Error(
      `HubSpot property create failed (${prop.name}): ${res.status} ${
        data?.message || JSON.stringify(data).slice(0, 200)
      }`,
    );
  }
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

/** Create a Deal associated to the given Contact; returns the deal id. */
async function createDeal({ contactId, dealProperties }) {
  const { res, data } = await hsFetch("/crm/v3/objects/deals", {
    method: "POST",
    body: {
      properties: dealProperties,
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOC_DEAL_TO_CONTACT,
            },
          ],
        },
      ],
    },
  });
  if (res.status !== 201) {
    throw new Error(
      `HubSpot deal create failed: ${res.status} ${
        data?.message || JSON.stringify(data).slice(0, 200)
      }`,
    );
  }
  return data?.id;
}

/** Create an HTML Note associated to both the Contact and the Deal. */
async function createNote({ contactId, dealId, html }) {
  const associations = [
    {
      to: { id: contactId },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: ASSOC_NOTE_TO_CONTACT,
        },
      ],
    },
  ];
  if (dealId) {
    associations.push({
      to: { id: dealId },
      types: [
        {
          associationCategory: "HUBSPOT_DEFINED",
          associationTypeId: ASSOC_NOTE_TO_DEAL,
        },
      ],
    });
  }
  const { res, data } = await hsFetch("/crm/v3/objects/notes", {
    method: "POST",
    body: {
      properties: {
        hs_note_body: html,
        hs_timestamp: new Date().toISOString(),
      },
      associations,
    },
  });
  if (res.status !== 201) {
    throw new Error(
      `HubSpot note create failed: ${res.status} ${
        data?.message || JSON.stringify(data).slice(0, 200)
      }`,
    );
  }
  return data?.id;
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

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlList(items) {
  const safe = (items || [])
    .map((x) => asText(x))
    .filter(Boolean)
    .map((x) => `<li>${escapeHtml(x)}</li>`)
    .join("");
  return safe ? `<ul>${safe}</ul>` : "";
}

function htmlPara(label, value) {
  const v = asText(value);
  if (!v) return "";
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(v)}</p>`;
}

/**
 * Shape a Prisma Conversation (with eager visitor) + its Report rows into
 * the HubSpot Contact + Deal payloads, plus a Note HTML body.
 *
 * Returns { contactProps, dealProps, noteHtml }.
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
    firstname: firstName ? firstName.slice(0, 50) : undefined,
    lastname: lastName.slice(0, 50),
    company: (visitor.company || "Unknown").slice(0, 255),
    lead_source_detail: "Interactive Avatar",
  };
  if (rating) {
    contactProps.lifecyclestage = LIFECYCLE_BY_RATING[rating];
    contactProps.avatar_qualification_rating = rating;
  }
  contactProps.avatar_conversation_id = conversation.id;
  if (leadQual.Role) contactProps.jobtitle = asText(leadQual.Role).slice(0, 100);
  if (leadQual.Industry)
    contactProps.industry = asText(leadQual.Industry).slice(0, 100);
  const empCount = digitsOnly(leadQual.CompanySize);
  if (empCount) contactProps.numemployees = Math.round(empCount);
  const annualRevenue = digitsOnly(leadQual.Budget);
  if (annualRevenue) contactProps.annualrevenue = annualRevenue;

  const visitorLabel = visitor.name || visitor.email;
  const dateStr = new Date(
    conversation.startTime || Date.now(),
  )
    .toISOString()
    .slice(0, 10);
  const dealProps = {
    dealname: `Avatar conversation — ${visitorLabel} — ${dateStr}`,
    dealstage: DEAL_STAGE,
    pipeline: DEAL_PIPELINE,
    description: `Lead generated from Interactive Avatar conversation (ID: ${conversation.id}).${
      rating ? ` Qualification rating: ${rating}.` : ""
    }`,
  };
  if (annualRevenue) dealProps.amount = annualRevenue;

  // Build the HTML Note body. Sales reads this to get the gist of the
  // conversation without having to open the admin UI.
  const sections = [];
  if (rating) {
    sections.push(
      `<p><strong>Qualification rating:</strong> ${escapeHtml(rating)}</p>`,
    );
  }
  if (Array.isArray(nextActions.Actions) && nextActions.Actions.length > 0) {
    sections.push("<h3>Recommended next actions</h3>");
    sections.push(htmlList(nextActions.Actions));
  }
  const challengesHtml = htmlList(
    Array.isArray(painPoints.CurrentChallenges)
      ? painPoints.CurrentChallenges
      : painPoints.CurrentChallenges
        ? [painPoints.CurrentChallenges]
        : [],
  );
  if (challengesHtml) {
    sections.push("<h3>Pain points</h3>");
    sections.push(challengesHtml);
  }
  const impactPara = htmlPara("Business impact", painPoints.ImpactOnBusiness);
  if (impactPara) sections.push(impactPara);
  if (leadQual.Timeline) sections.push(htmlPara("Timeline", leadQual.Timeline));
  if (leadQual.Notes) sections.push(htmlPara("Notes", leadQual.Notes));
  const tools = asText(techStack.CurrentTools);
  if (tools) sections.push(htmlPara("Current tools", tools));
  sections.push(
    `<p><em>Avatar conversation ID: ${escapeHtml(conversation.id)}</em></p>`,
  );

  const noteHtml = sections.join("\n");

  return { contactProps, dealProps, noteHtml };
}

/**
 * Top-level orchestration. Throws on the first hard failure; everything is
 * idempotent enough that a retry won't double-create the contact (upsert)
 * but WILL create another deal/note — sales can dedupe by reviewing the
 * contact timeline.
 */
export async function pushLeadToHubspot({ contactProps, dealProps, noteHtml }) {
  await ensureCustomProperties();
  const contactId = await upsertContact(contactProps);
  const dealId = await createDeal({ contactId, dealProperties: dealProps });
  const noteId = await createNote({ contactId, dealId, html: noteHtml });
  return { contactId, dealId, noteId };
}
