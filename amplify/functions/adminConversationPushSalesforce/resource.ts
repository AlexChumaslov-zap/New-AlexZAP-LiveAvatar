import { defineFunction, secret } from "@aws-amplify/backend";

export const adminConversationPushSalesforce = defineFunction({
  name: "adminConversationPushSalesforce",
  entry: "./handler.js",
  runtime: 20,
  timeoutSeconds: 30,
  memoryMB: 512,
  environment: {
    DATABASE_URL: secret("DATABASE_URL"),
    TURSO_AUTH_TOKEN: secret("TURSO_AUTH_TOKEN"),
    ADMIN_USERNAME: secret("ADMIN_USERNAME"),
    ADMIN_PASSWORD: secret("ADMIN_PASSWORD"),
    SALESFORCE_CLIENT_ID: secret("SALESFORCE_CLIENT_ID"),
    SALESFORCE_CLIENT_SECRET: secret("SALESFORCE_CLIENT_SECRET"),
    SALESFORCE_USERNAME: secret("SALESFORCE_USERNAME"),
    SALESFORCE_PASSWORD: secret("SALESFORCE_PASSWORD"),
    // SALESFORCE_LOGIN_URL is optional and defaults to https://login.salesforce.com.
    // Re-add as a secret only if pointing at a sandbox (https://test.salesforce.com)
    // or a My Domain URL — otherwise leave undeclared so the default kicks in.
  },
});
