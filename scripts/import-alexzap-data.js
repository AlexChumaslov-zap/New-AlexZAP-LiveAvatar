// One-shot import of AlexZAP's historical data into our (Turso or local)
// database. Reads from scripts/data/alexzap.sqlite via @libsql/client, writes
// to whatever DATABASE_URL points at.
//
// Run:
//   node --env-file=.env scripts/import-alexzap-data.js
//
// Order: visitors → conversations → messages → reports (FK dependency).
// All UUIDs and timestamps are preserved verbatim so the imported rows
// align with anything else AlexZAP-side.

import { createClient } from "@libsql/client";

const SOURCE_URL = "file:./scripts/data/alexzap.sqlite";
const TARGET_URL = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const TARGET_AUTH = process.env.TURSO_AUTH_TOKEN;

if (!TARGET_URL) {
  console.error("Missing target DATABASE_URL / TURSO_DATABASE_URL");
  process.exit(1);
}

const source = createClient({ url: SOURCE_URL });
const target = createClient({
  url: TARGET_URL,
  authToken: TARGET_AUTH,
});

const CHUNK = 100;

async function importTable({ name, columns, sourceSelect, prepStmt, prepArgs }) {
  const result = await source.execute(sourceSelect);
  const rows = result.rows;
  console.log(`\n${name}: ${rows.length} row(s) to import`);
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const stmts = chunk.map((row) => ({
      sql: prepStmt,
      args: prepArgs(row),
    }));
    await target.batch(stmts, "write");
    process.stdout.write(`  ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }
  console.log(` ${rows.length}/${rows.length} ✓`);
}

console.log(`Source: ${SOURCE_URL}`);
console.log(
  `Target: ${TARGET_URL.replace(/.*@/, "[redacted]@").slice(0, 60)}…`,
);

// --- Visitors ---
await importTable({
  name: "visitors",
  sourceSelect:
    "SELECT id, name, position, company, email, first_visit, last_visit, created_at, updated_at FROM visitors",
  prepStmt:
    "INSERT INTO visitors (id, name, position, company, email, first_visit, last_visit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  prepArgs: (r) => [
    r.id,
    r.name,
    r.position,
    r.company,
    r.email,
    r.first_visit,
    r.last_visit,
    r.created_at,
    r.updated_at,
  ],
});

// --- Conversations ---
await importTable({
  name: "conversations",
  sourceSelect:
    "SELECT id, visitor_id, start_time, end_time, total_messages, status, created_at, updated_at FROM conversations",
  prepStmt:
    "INSERT INTO conversations (id, visitor_id, start_time, end_time, total_messages, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  prepArgs: (r) => [
    r.id,
    r.visitor_id,
    r.start_time,
    r.end_time,
    r.total_messages,
    r.status,
    r.created_at,
    r.updated_at,
  ],
});

// --- Messages ---
await importTable({
  name: "messages",
  sourceSelect:
    "SELECT id, conversation_id, sender, message_text, timestamp, created_at FROM messages",
  prepStmt:
    "INSERT INTO messages (id, conversation_id, sender, message_text, timestamp, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  prepArgs: (r) => [
    r.id,
    r.conversation_id,
    r.sender,
    r.message_text,
    r.timestamp,
    r.created_at,
  ],
});

// --- Reports ---
await importTable({
  name: "reports",
  sourceSelect:
    "SELECT id, name, generated_at, report_data, used_in_campaign, created_at, updated_at, conversation_id FROM reports",
  prepStmt:
    "INSERT INTO reports (id, name, generated_at, report_data, used_in_campaign, created_at, updated_at, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  prepArgs: (r) => [
    r.id,
    r.name,
    r.generated_at,
    r.report_data,
    r.used_in_campaign,
    r.created_at,
    r.updated_at,
    r.conversation_id,
  ],
});

// --- Verify ---
console.log("\nVerifying row counts in target…");
for (const t of ["visitors", "conversations", "messages", "reports"]) {
  const c = await target.execute(`SELECT COUNT(*) AS c FROM ${t}`);
  console.log(`  ${t}: ${c.rows[0].c}`);
}

source.close();
target.close();
console.log("\nDone.");
