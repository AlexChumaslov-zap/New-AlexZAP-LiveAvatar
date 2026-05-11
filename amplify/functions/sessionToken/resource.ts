import { defineFunction, secret } from "@aws-amplify/backend";

export const sessionToken = defineFunction({
  name: "sessionToken",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 256,
  environment: {
    // Required
    LIVEAVATAR_API_KEY: secret("LIVEAVATAR_API_KEY"),
    LIVEAVATAR_AVATAR_ID: secret("LIVEAVATAR_AVATAR_ID"),
    // Optional — handler has fallback to default API base; sandbox/force/rate
    // each check for specific values, so "false"/"0" is equivalent to unset.
    LIVEAVATAR_API_BASE: secret("LIVEAVATAR_API_BASE"),
    LIVEAVATAR_SANDBOX: secret("LIVEAVATAR_SANDBOX"),
    FORCE_API_DOWN: secret("FORCE_API_DOWN"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
    // LIVEAVATAR_VOICE_ID and LIVEAVATAR_CONTEXT_ID are intentionally not
    // declared here — any non-empty value gets sent to the HeyGen API as a
    // literal ID, which breaks video-avatar sessions. To use them (for image
    // avatars / specific contexts), re-add the line + create the secret.
  },
});
