# AWS Amplify Gen 2 deployment guide

This project ships frontend (Vite SPA) + backend (15 Lambda functions behind
an HTTP API Gateway) via AWS Amplify Gen 2, deployed to **us-east-1** from
a GitHub repo.

## Prerequisites

- AWS account with permission to create: IAM roles, Lambda functions, API
  Gateway HTTP APIs, CloudFront distributions, S3 buckets, CloudFormation stacks.
- The repo already pushed to GitHub.
- A Turso database (`DATABASE_URL` + `TURSO_AUTH_TOKEN`). The Vercel/Netlify
  Turso DB you've been using will work as-is.
- All env values from your `.env.example` (or the equivalent prod versions).

## Initial deploy

### 1. Connect the repo in Amplify Console

1. AWS Console → **AWS Amplify** → **New app** → **Host web app**.
2. Pick **GitHub**, authorize, choose this repository + branch.
3. Amplify auto-detects `amplify.yml` at the repo root — leave the build
   settings as detected. You don't need to edit them.
4. Click **Next** → **Save and deploy**.

The first build will likely **fail** on the backend phase, complaining about
missing secrets. That's expected — secrets get configured in step 2.

### 2. Set secrets (App settings → Secrets)

In the Amplify Console for this app: **App settings** → **Secret management** →
**Manage secrets**. Add one secret per row (name + value):

**Required for the visitor-facing avatar:**
- `LIVEAVATAR_API_KEY`
- `LIVEAVATAR_API_BASE` (e.g. `https://api.liveavatar.com`)
- `LIVEAVATAR_AVATAR_ID`
- `LIVEAVATAR_CONTEXT_ID` (blank if you don't have one)
- `LIVEAVATAR_VOICE_ID` (blank if video avatar)
- `LIVEAVATAR_SANDBOX` (blank for production)
- `FORCE_API_DOWN` (blank)
- `RATE_LIMIT_DISABLED` (blank)

**Required for /api/visitor + the whole admin surface:**
- `DATABASE_URL` — `libsql://<your-db>.turso.io`
- `TURSO_AUTH_TOKEN`

**Required for admin auth:**
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

**Required for /api/email-transcript:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`

**Required for /api/admin/reports/generate:**
- `OPENAI_API_KEY`
- `OPENAI_REPORT_MODEL` (e.g. `gpt-4o-mini`, or leave blank for default)

**Required for /api/admin/conversations/:id/push-salesforce:**
- `SALESFORCE_CLIENT_ID`
- `SALESFORCE_CLIENT_SECRET`
- `SALESFORCE_USERNAME`
- `SALESFORCE_PASSWORD` (password + security token, no separator)
- `SALESFORCE_LOGIN_URL` (blank for production org)

After adding secrets, trigger a redeploy: **App overview** → click the latest
deploy → **Redeploy this version**.

### 3. Find the HTTP API Gateway URL

Once the backend build succeeds, the API Gateway URL appears in two places:

- **CloudFormation** → stack `amplify-<app-id>-<branch>-LiveAvatarApiStack` →
  **Outputs** tab → look for `httpApiUrl`.
- Or **API Gateway** console → HTTP APIs → `liveavatar-api` → copy the
  Invoke URL (looks like `https://abc123.execute-api.us-east-1.amazonaws.com`).

Copy that URL — you need it for step 4.

### 4. Wire the frontend /api/* rewrite

The React app calls `/api/...` as relative URLs. We need Amplify Hosting to
proxy those calls to API Gateway.

In the Amplify Console: **App settings** → **Rewrites and redirects** → **Add
rule**:

| Source | Target | Type |
|---|---|---|
| `/api/<*>` | `https://abc123.execute-api.us-east-1.amazonaws.com/api/<*>` | `200 (Rewrite)` |

Use your actual API Gateway URL (without trailing slash). Save.

### 5. Verify

- Visit `https://<branch>.<app-id>.amplifyapp.com/` — the avatar should
  load and connect.
- Visit `https://<branch>.<app-id>.amplifyapp.com/admin/conversations` —
  browser prompts for Basic Auth. Enter `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
  The list should populate.
- Try **Generate Reports** on a conversation with messages — OpenAI runs
  under the 60s timeout we configured.
- Try **Push to Salesforce** — Lead should appear in your SF Connected App's
  org.

## Local development

```bash
# Terminal 1: Amplify sandbox (deploys ephemeral Lambdas to your AWS account)
npm run dev
# This is `npx ampx sandbox` — first run prompts for AWS profile.
# Set local secrets via:
#   npx ampx sandbox secret set ADMIN_PASSWORD
# etc.

# Terminal 2: Vite frontend
npm run dev:frontend
# Frontend served at http://localhost:5173, proxies /api/* to the sandbox.
```

Notes:
- The sandbox runs against real AWS resources, so changes incur tiny costs.
- Tear down with `npx ampx sandbox delete` when done for the day.
- Frontend Vite proxy config (in `frontend/vite.config.js`) needs the
  sandbox's HTTP API URL — update it if you change AWS profiles.

## Custom domain

**App settings → Domain management → Add domain.** Amplify handles ACM
certificate provisioning + DNS. The `/api/*` rewrite from step 4 applies to
the custom domain too.

## Day-2: /admin/* HTML lockdown via Lambda@Edge

The initial deploy protects `/api/admin/*` data with inline Basic Auth in
each Lambda. The `/admin/*` *HTML pages* themselves are publicly fetchable
(the React bundle loads, but every API call returns 401 without auth).

To lock the HTML pages too:

**Option A — Lambda@Edge attached manually** (~30 min, no code changes)
1. Create a separate Lambda function in **us-east-1** (Lambda@Edge requirement)
   with this handler:
   ```js
   exports.handler = async (event) => {
     const request = event.Records[0].cf.request;
     const auth = request.headers.authorization?.[0]?.value;
     const expected = 'Basic ' + Buffer.from('<USER>:<PASS>').toString('base64');
     if (auth !== expected) {
       return {
         status: '401',
         statusDescription: 'Unauthorized',
         headers: {
           'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic realm="Admin"' }],
         },
       };
     }
     return request;
   };
   ```
   Hardcode `<USER>` / `<PASS>` (or fetch from SSM at cold start — more code).
2. Publish a version of the Lambda.
3. **CloudFront console** → find the Amplify-managed distribution for this
   app → **Behaviors** → create a new behavior for path pattern `/admin/*`
   → **Function associations** → **Viewer request** → **Lambda@Edge** →
   paste the function's published-version ARN.
4. Wait ~5 minutes for CF distribution propagation. Hit `/admin/conversations`
   from incognito; you should see the Basic Auth prompt before the page loads.

**Caveat:** attaching Lambda@Edge to an Amplify-managed CloudFront
distribution is *unsupported by AWS* — Amplify may revert the association on
future deploys. If you do this and find it reverts, you'll need Option B.

**Option B — Self-managed CloudFront + S3 stack** (full control)

Replace Amplify Hosting with a CDK-defined CloudFront distribution + S3
origin. The frontend build artifact still comes from `amplify.yml`, but you
write S3 sync + cache invalidation steps in the `frontend` phase, and define
the CloudFront distribution (with Lambda@Edge association already wired) in
`amplify/backend.ts`. ~half a day of work; tell me if you want this and I'll
write it.

## Troubleshooting

**Backend phase fails: "Secret not found"** — go through step 2 again, then
redeploy.

**Frontend phase succeeds but /api/* returns 404** — you forgot step 4 (the
rewrite rule). Add it and reload (rewrites apply immediately, no redeploy).

**Lambda logs show "DATABASE_URL is not set"** — the secret is registered
but not bound to that Lambda. Check `amplify/functions/<name>/resource.ts`
to confirm the env block includes the secret name. After fixing, redeploy.

**Cold-start latency feels high** — Lambda is cold-starting Prisma + libSQL.
First request after idle can take 2-3s. Subsequent requests are sub-200ms.
For consistent low latency, add `provisionedConcurrentExecutions` to the
busy functions in their `resource.ts`.

**Reports generation times out** — check the Lambda's CloudWatch log group;
look for an OpenAI error vs a `Task timed out after Xs` message. If
timeout: bump `timeoutSeconds` in `amplify/functions/adminReportsGenerate/resource.ts`
(can go up to 900). If OpenAI error: check API key + billing on the OpenAI
side.
