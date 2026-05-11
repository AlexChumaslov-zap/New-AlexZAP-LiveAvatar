// Singleton Prisma client wrapper that uses the libSQL driver adapter.
//
// One client connects to:
// - a local SQLite file when DATABASE_URL starts with `file:` (local dev)
// - a Turso cloud database when DATABASE_URL starts with `libsql://` and
//   TURSO_AUTH_TOKEN is set (production)
//
// Cached on the module's lexical scope so warm Lambda invocations reuse the
// same connection. Cold starts pay the open-connection cost once.

import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

let _prisma;

export function getPrisma() {
  if (_prisma) return _prisma;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
  const adapter = new PrismaLibSql({ url, authToken });
  _prisma = new PrismaClient({ adapter });
  return _prisma;
}
