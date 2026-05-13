import { defineFunction, secret } from "@aws-amplify/backend";
import { LIBSQL_LAYER } from "../../lambda-layers.js";

export const adminConversationDetail = defineFunction({
  name: "adminConversationDetail",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 384,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    ADMIN_USERNAME: secret("ADMIN_USERNAME"),
    ADMIN_PASSWORD: secret("ADMIN_PASSWORD"),
  },
  layers: LIBSQL_LAYER,
});
