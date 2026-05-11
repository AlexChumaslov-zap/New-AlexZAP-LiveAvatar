import { defineFunction, secret } from "@aws-amplify/backend";

export const logEvent = defineFunction({
  name: "logEvent",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 10,
  memoryMB: 128,
  environment: {
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
});
