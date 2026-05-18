import { defineFunction, secret } from "@aws-amplify/backend";
import { LIBSQL_LAYER } from "../../lambda-layers.js";

export const adminCronReports = defineFunction({
  name: "adminCronReports",
  entry: "./handler.js",
  runtime: 20,
  // 20 conversations × ~30s OpenAI each = ~600s worst case, but in practice
  // most runs are small. 5 min covers the full BATCH_SIZE comfortably.
  timeoutSeconds: 300,
  memoryMB: 512,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    OPENAI_API_KEY: secret("OPENAI_API_KEY"),
    HUBSPOT_PRIVATE_APP_TOKEN: secret("HUBSPOT_PRIVATE_APP_TOKEN"),
  },
  layers: LIBSQL_LAYER,
});
