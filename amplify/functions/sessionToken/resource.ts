import { defineFunction, secret } from "@aws-amplify/backend";

export const sessionToken = defineFunction({
  name: "sessionToken",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 256,
  environment: {
    // Required for any avatar
    LIVEAVATAR_API_KEY: secret("LIVEAVATAR_API_KEY"),
    LIVEAVATAR_AVATAR_ID: secret("LIVEAVATAR_AVATAR_ID"),
    // Required for custom avatars — the knowledge-base / context ID that
    // drives the avatar's LLM responses. Without it, the avatar streams
    // video but has nothing to say.
    LIVEAVATAR_CONTEXT_ID: secret("LIVEAVATAR_CONTEXT_ID"),
    // Required ONLY for image (non-video) avatars. For video avatars, set
    // the secret to a sentinel value like "none" or "unset" — the handler
    // currently treats any truthy value as a literal voice_id which will
    // fail for video avatars. If your custom avatar is video, see TODO note
    // below.
    LIVEAVATAR_VOICE_ID: secret("LIVEAVATAR_VOICE_ID"),
    // Optional — handler has fallback to default API base; sandbox/force/rate
    // each check for specific values, so "false"/"0" is equivalent to unset.
    LIVEAVATAR_API_BASE: secret("LIVEAVATAR_API_BASE"),
    LIVEAVATAR_SANDBOX: secret("LIVEAVATAR_SANDBOX"),
    FORCE_API_DOWN: secret("FORCE_API_DOWN"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
});
