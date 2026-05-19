import { defineFunction, secret } from "@aws-amplify/backend";
import { LIBSQL_LAYER } from "../../lambda-layers.js";

export const processConversationReports = defineFunction({
  name: "processConversationReports",
  entry: "./handler.js",
  runtime: 20,
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
