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
    SALESFORCE_LOGIN_URL: secret("SALESFORCE_LOGIN_URL"),
  },
});
