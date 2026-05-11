import { defineFunction, secret } from "@aws-amplify/backend";

export const health = defineFunction({
  name: "health",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 10,
  memoryMB: 256,
  environment: {
    LIVEAVATAR_API_BASE: secret("LIVEAVATAR_API_BASE"),
    FORCE_API_DOWN: secret("FORCE_API_DOWN"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
});
