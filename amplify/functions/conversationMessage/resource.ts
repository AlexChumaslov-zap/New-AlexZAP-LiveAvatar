import { defineFunction, secret } from "@aws-amplify/backend";
import { LIBSQL_LAYER } from "../../lambda-layers.js";

export const conversationMessage = defineFunction({
  name: "conversationMessage",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 384,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
  layers: LIBSQL_LAYER,
});
