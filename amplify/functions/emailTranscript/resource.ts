import { defineFunction, secret } from "@aws-amplify/backend";

export const emailTranscript = defineFunction({
  name: "emailTranscript",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 15,
  memoryMB: 256,
  environment: {
    SMTP_HOST: secret("SMTP_HOST"),
    SMTP_PORT: secret("SMTP_PORT"),
    SMTP_SECURE: secret("SMTP_SECURE"),
    SMTP_USER: secret("SMTP_USER"),
    SMTP_PASSWORD: secret("SMTP_PASSWORD"),
    SMTP_FROM_EMAIL: secret("SMTP_FROM_EMAIL"),
    RATE_LIMIT_DISABLED: secret("RATE_LIMIT_DISABLED"),
  },
});
