import { defineFunction, secret } from "@aws-amplify/backend";
import { LIBSQL_LAYER } from "../../lambda-layers.js";

export const adminConversationPushHubspot = defineFunction({
  name: "adminConversationPushHubspot",
  entry: "./handler.js",
  runtime: 20,
  // HubSpot calls are ~3 sequential API calls (property check + contact +
  // deal + note); each takes ~200-400ms. Bump timeout for the rare slow case.
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    ADMIN_USERNAME: secret("ADMIN_USERNAME"),
    ADMIN_PASSWORD: secret("ADMIN_PASSWORD"),
    HUBSPOT_PRIVATE_APP_TOKEN: secret("HUBSPOT_PRIVATE_APP_TOKEN"),
  },
  layers: LIBSQL_LAYER,
});
