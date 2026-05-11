// Apply Prisma migrations to a remote libSQL/Turso database.
//
// Why this exists:
//   Prisma 7's CLI does migrations through its own SQLite engine, which only
//   speaks the native SQLite file protocol. For Turso (remote libSQL) we need
//   to apply the migration SQL via @libsql/client instead.
//
// Run:
//   node --env-file=.env scripts/push-schema-to-turso.js
//
// Reads from $TURSO_DATABASE_URL or $DATABASE_URL (whichever points at libsql)
// and $TURSO_AUTH_TOKEN. Idempotent on the per-statement level — re-running
// after a successful push will fail loudly on "table already exists" so you
// know not to do it twice.

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !url.startsWith("libsql://")) {
  console.error(
    "Missing or non-libsql DATABASE_URL. Set TURSO_DATABASE_URL=libsql://… (or DATABASE_URL).",
  );
  process.exit(1);
}
if (!authToken) {
  console.error("Missing TURSO_AUTH_TOKEN.");
  process.exit(1);
}

const client = createClient({ url, authToken });

const migrationsDir = "prisma/migrations";
const dirs = readdirSync(migrationsDir)
  .filter((d) => statSync(join(migrationsDir, d)).isDirectory())
  .sort();

if (dirs.length === 0) {
  console.error("No migrations found in", migrationsDir);
  process.exit(1);
}

console.log(`Pushing ${dirs.length} migration(s) to ${url.replace(/.*@/, "[redacted]@").slice(0, 60)}…`);

for (const dir of dirs) {
  const sqlPath = join(migrationsDir, dir, "migration.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  // Strip line comments first (Prisma's migration.sql sprinkles `-- CreateTable`
  // headers above each statement), then split on statement terminator.
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = stripped
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`\n${dir} — ${statements.length} statement(s)`);
  for (const stmt of statements) {
    const preview = stmt.split("\n")[0].slice(0, 70);
    process.stdout.write(`  • ${preview}${stmt.split("\n").length > 1 ? "…" : ""}\n`);
    await client.execute(stmt);
  }
}

console.log("\nSchema pushed. Verifying tables…");
const result = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY name",
);
console.log("Tables now in Turso:", result.rows.map((r) => r.name).join(", "));

client.close();
