// Prisma 7 config — connection URL must live here (no longer in schema.prisma).
// Loaded automatically by `prisma` CLI commands.

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
