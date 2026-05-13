// Amplify Gen 2 backend — 15 Lambdas wired through an HTTP API Gateway,
// plus a Lambda@Edge function for /admin/* Basic Auth.
//
// REST routing is not a first-class Gen 2 primitive; we use the CDK escape
// hatch (HttpApi + HttpLambdaIntegration) to build it. Each Lambda's URL is
// preserved exactly as it was on Netlify/Vercel so the React frontend
// doesn't need URL changes — only a single rewrite rule in Amplify Hosting
// to point /api/* at the HTTP API Gateway URL emitted as a stack output.

import { defineBackend } from "@aws-amplify/backend";
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";

import { sessionToken } from "./functions/sessionToken/resource.js";
import { health } from "./functions/health/resource.js";
import { logEvent } from "./functions/logEvent/resource.js";
import { emailTranscript } from "./functions/emailTranscript/resource.js";
import { visitor } from "./functions/visitor/resource.js";
import { conversationStart } from "./functions/conversationStart/resource.js";
import { conversationMessage } from "./functions/conversationMessage/resource.js";
import { conversationEnd } from "./functions/conversationEnd/resource.js";
import { adminConversationsList } from "./functions/adminConversationsList/resource.js";
import { adminConversationsBulkEnd } from "./functions/adminConversationsBulkEnd/resource.js";
import { adminConversationDetail } from "./functions/adminConversationDetail/resource.js";
import { adminConversationEnd } from "./functions/adminConversationEnd/resource.js";
import { adminConversationDelete } from "./functions/adminConversationDelete/resource.js";
import { adminConversationPushSalesforce } from "./functions/adminConversationPushSalesforce/resource.js";
import { adminReportsGenerate } from "./functions/adminReportsGenerate/resource.js";
import { adminAnalytics } from "./functions/adminAnalytics/resource.js";

const backend = defineBackend({
  sessionToken,
  health,
  logEvent,
  emailTranscript,
  visitor,
  conversationStart,
  conversationMessage,
  conversationEnd,
  adminConversationsList,
  adminConversationsBulkEnd,
  adminConversationDetail,
  adminConversationEnd,
  adminConversationDelete,
  adminConversationPushSalesforce,
  adminReportsGenerate,
  adminAnalytics,
});

const apiStack = backend.createStack("LiveAvatarApiStack");

const httpApi = new HttpApi(apiStack, "LiveAvatarHttpApi", {
  apiName: "liveavatar-api",
  corsPreflight: {
    allowMethods: [
      CorsHttpMethod.GET,
      CorsHttpMethod.POST,
      CorsHttpMethod.DELETE,
      CorsHttpMethod.OPTIONS,
    ],
    allowOrigins: ["*"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: undefined,
  },
});

// Public endpoints used by the visitor-facing avatar.
const ROUTES: Array<{
  path: string;
  methods: HttpMethod[];
  fn: keyof typeof backend;
  id: string;
}> = [
  { path: "/api/session/token", methods: [HttpMethod.POST], fn: "sessionToken", id: "SessionTokenIntg" },
  { path: "/api/health",          methods: [HttpMethod.GET],  fn: "health",        id: "HealthIntg" },
  { path: "/api/log-event",       methods: [HttpMethod.POST], fn: "logEvent",      id: "LogEventIntg" },
  { path: "/api/email-transcript",methods: [HttpMethod.POST], fn: "emailTranscript", id: "EmailIntg" },
  { path: "/api/visitor",         methods: [HttpMethod.POST], fn: "visitor",       id: "VisitorIntg" },
  { path: "/api/conversation/start",   methods: [HttpMethod.POST], fn: "conversationStart",   id: "ConvStartIntg" },
  { path: "/api/conversation/message", methods: [HttpMethod.POST], fn: "conversationMessage", id: "ConvMsgIntg" },
  { path: "/api/conversation/end",     methods: [HttpMethod.POST], fn: "conversationEnd",     id: "ConvEndIntg" },

  // Admin endpoints. Basic Auth is enforced inline by lib/adminAuth.js inside
  // each handler — no API Gateway authorizer required.
  { path: "/api/admin/conversations",          methods: [HttpMethod.GET],  fn: "adminConversationsList",    id: "AdmListIntg" },
  { path: "/api/admin/conversations/bulk-end", methods: [HttpMethod.POST], fn: "adminConversationsBulkEnd", id: "AdmBulkEndIntg" },
  // Detail endpoint sits at /{id}/detail (not bare /{id}) to disambiguate from
  // the list endpoint above. Without the /detail suffix, API Gateway's HTTP
  // API v2 routing matched /api/admin/conversations (no id) to the {id}
  // handler when Amplify Hosting's CloudFront layer appended a trailing slash,
  // producing 400 missing_id on the list request.
  { path: "/api/admin/conversations/{id}/detail", methods: [HttpMethod.GET], fn: "adminConversationDetail", id: "AdmDetailIntg" },
  { path: "/api/admin/conversations/{id}/end", methods: [HttpMethod.POST], fn: "adminConversationEnd",      id: "AdmConvEndIntg" },
  { path: "/api/admin/conversations/{id}/delete",
    methods: [HttpMethod.POST, HttpMethod.DELETE],
    fn: "adminConversationDelete", id: "AdmDeleteIntg" },
  { path: "/api/admin/conversations/{id}/push-salesforce",
    methods: [HttpMethod.POST], fn: "adminConversationPushSalesforce", id: "AdmPushSfIntg" },
  { path: "/api/admin/reports/generate", methods: [HttpMethod.POST], fn: "adminReportsGenerate", id: "AdmReportsIntg" },
  { path: "/api/admin/analytics",        methods: [HttpMethod.GET],  fn: "adminAnalytics",       id: "AdmAnalyticsIntg" },
];

for (const r of ROUTES) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lambda = (backend[r.fn] as any).resources.lambda;
  httpApi.addRoutes({
    path: r.path,
    methods: r.methods,
    integration: new HttpLambdaIntegration(r.id, lambda),
  });
}

// Expose the HTTP API root URL so the frontend can pick it up via Amplify
// Hosting rewrites. After first deploy, the user adds an Amplify Hosting
// rewrite rule: /api/<*>  →  <apiUrl>/api/<*>  (200).
backend.addOutput({
  custom: {
    httpApiUrl: httpApi.url ?? "",
  },
});

// Note: /admin/* HTML pages are NOT protected at the edge in this version.
// The /api/admin/* data behind them IS protected (inline Basic Auth via
// lib/adminAuth.js). For full HTML lockdown, see DEPLOY.md "Day-2: Lambda@Edge
// for /admin/* HTML" — adding it requires either an SSM-backed Lambda@Edge
// or moving the frontend to a CDK-managed CloudFront+S3 stack.
