import { defineFunction, secret } from "@aws-amplify/backend";

export const sessionToken = defineFunction({
  name: "sessionToken",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 256,
  environment: {
    LIVEAVATAR_API_KEY: secret("LIVEAVATAR_API_KEY"),
    LIVEAVATAR_API_BASE: secret("LIVEAVATAR_API_BASE"),
    LIVEAVATAR_AVATAR_ID: secret("LIVEAVATAR_AVATAR_ID"),
    LIVEAVATAR_CONTEXT_ID: secret("LIVEAVATAR_CONTEXT_ID"),
    LIVEAVATAR_VOICE_ID: secret("LIVEAVATAR_VOICE_ID"),
    LIVEAVATAR_SANDBOX: secret("LIVEAVATAR_SANDBOX"),
    FORCE_API_DOWN: secret("FORCE_API_DOWN"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
});
