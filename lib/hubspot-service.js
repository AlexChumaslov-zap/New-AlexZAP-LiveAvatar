// HubSpot CRM integration — creates/upserts a Contact and attaches a Note
// containing the full conversation transcript.
//
// Auth: HubSpot Private App bearer token (HUBSPOT_PRIVATE_APP_TOKEN).
// Required scopes (Private App → Settings → Integrations):
//   crm.objects.contacts.read
//   crm.objects.contacts.write
//   crm.objects.notes.write

const HS_BASE = "https://api.hubapi.com";

// HubSpot standard association type: Note → Contact (HUBSPOT_DEFINED).
const ASSOC_NOTE_TO_CONTACT = 202;

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

/** Create a Contact without email (no deduplication); returns the contact id. */
async function createContact(properties) {
  const { res, data } = await hsFetch("/crm/v3/objects/contacts", {
    method: "POST",
    body: { properties },
  });
  if (res.status !== 201) {
    throw new Error(
      `HubSpot contact create failed: ${res.status} ${
        data?.message || JSON.stringify(data).slice(0, 200)
      }`,
    );
  }
  if (!data?.id) {
    throw new Error("HubSpot contact create returned no id");
  }
  return data.id;
}

/** Create a Note associated to a Contact; returns the note id. */
async function createNote(contactId, html) {
  const { res, data } = await hsFetch("/crm/v3/objects/notes", {
    method: "POST",
    body: {
      properties: {
        hs_note_body: html,
        hs_timestamp: new Date().toISOString(),
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            {
              associationCategory: "HUBSPOT_DEFINED",
              associationTypeId: ASSOC_NOTE_TO_CONTACT,
            },
          ],
        },
      ],
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

function buildNoteHtml(messages, conversation, rating) {
  const visitor = conversation.visitor || {};
  const dateStr = conversation.startTime
    ? new Date(conversation.startTime).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const visitorParts = [visitor.name, visitor.email, visitor.company].filter(Boolean);
  const visitorLine = visitorParts.length
    ? `<p><strong>Visitor:</strong> ${escapeHtml(visitorParts.join(" · "))}</p>`
    : "";

  const ratingLine = rating
    ? `<p><strong>Qualification:</strong> ${escapeHtml(rating)}</p>`
    : "";

  const messageRows = (messages || [])
    .filter((m) => m.messageText?.trim())
    .map((m) => {
      const isVisitor = m.sender === "visitor" || m.sender === "user";
      const role = isVisitor ? "Visitor" : "Avatar";
      const color = isVisitor ? "#1e40af" : "#166534";
      const text = escapeHtml(m.messageText).replace(/\n/g, "<br>");
      return `<p><strong style="color:${color};">${role}:</strong> ${text}</p>`;
    })
    .join("\n");

  return [
    `<h3>Avatar Conversation — ${escapeHtml(dateStr)}</h3>`,
    visitorLine,
    ratingLine,
    "<hr>",
    messageRows || "<p><em>No messages recorded.</em></p>",
    "<hr>",
    `<p><em>Conversation ID: ${escapeHtml(conversation.id)}</em></p>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Shape a Prisma Conversation (with eager visitor) + its Report rows into
 * a HubSpot Contact properties object and a transcript Note HTML body.
 *
 * Returns { contactProps, noteHtml }.
 * messages — optional array of Prisma Message rows (ordered by timestamp asc).
 */
export function formatPayload(conversation, reports, messages = []) {
  const visitor = conversation.visitor || {};

  let firstName = "";
  let lastName = "";
  if (visitor.name) {
    const parts = String(visitor.name).trim().split(/\s+/);
    firstName = parts[0] || "";
    lastName =
      parts.length > 1 ? parts[parts.length - 1] : parts[0] || "";
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
    ...(visitor.email ? { email: visitor.email } : {}),
    ...(firstName ? { firstname: firstName.slice(0, 50) } : {}),
    ...(lastName ? { lastname: lastName.slice(0, 50) } : {}),
    ...(visitor.company ? { company: visitor.company.slice(0, 255) } : {}),
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

  // Qualification summary in the standard `message` textarea field.
  const summaryLines = [];
  if (rating) summaryLines.push(`Qualification: ${rating}`);
  if (Array.isArray(nextActions.Actions) && nextActions.Actions.length > 0) {
    summaryLines.push("Next actions: " + nextActions.Actions.join(" | "));
  }
  const challenges = asText(
    Array.isArray(painPoints.CurrentChallenges)
      ? painPoints.CurrentChallenges.join("; ")
      : painPoints.CurrentChallenges,
  );
  if (challenges) summaryLines.push("Pain points: " + challenges);
  if (leadQual.Timeline) summaryLines.push("Timeline: " + asText(leadQual.Timeline));
  const tools = asText(techStack.CurrentTools);
  if (tools) summaryLines.push("Current tools: " + tools);
  summaryLines.push(`Avatar conversation ID: ${conversation.id}`);
  contactProps.message = summaryLines.join("\n");

  const noteHtml = buildNoteHtml(messages, conversation, rating);

  return { contactProps, noteHtml };
}

/**
 * Create or upsert a HubSpot Contact, then attach a Note with the transcript.
 * Returns { contactId, noteId }.
 */
export async function pushLeadToHubspot({ contactProps, noteHtml }) {
  const contactId = contactProps.email
    ? await upsertContact(contactProps)
    : await createContact(contactProps);

  let noteId = null;
  if (noteHtml) {
    try {
      noteId = await createNote(contactId, noteHtml);
    } catch (err) {
      // Note creation failing must not block the contact push — the contact
      // is already in HubSpot. Log and continue.
      console.error("HubSpot note create failed (non-fatal):", err?.message || err);
    }
  }

  return { contactId, noteId };
}
