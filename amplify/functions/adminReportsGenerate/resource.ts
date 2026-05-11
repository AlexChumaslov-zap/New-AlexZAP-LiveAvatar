import { defineFunction, secret } from "@aws-amplify/backend";

export const adminReportsGenerate = defineFunction({
  name: "adminReportsGenerate",
  entry: "./handler.js",
  runtime: 20,
  // OpenAI Responses calls run 20-30s; bump to 60s for safety. Lambda allows
  // up to 15 minutes, so we have headroom if the model gets slower.
  timeoutSeconds: 60,
  memoryMB: 512,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    ADMIN_USERNAME: secret("ADMIN_USERNAME"),
    ADMIN_PASSWORD: secret("ADMIN_PASSWORD"),
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    // OPENAI_REPORT_MODEL is optional and defaults to "gpt-4o-mini". Re-add
    // as a secret only to override the model — e.g. "gpt-4o" or "gpt-4o-mini-2024-...".

  },
});
