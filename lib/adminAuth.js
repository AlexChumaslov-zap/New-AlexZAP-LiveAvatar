// Inline Basic Auth check for /api/admin/* Lambda handlers.
//
// On Netlify/Vercel we had this at the edge (Edge Function / middleware.ts).
// On Amplify Gen 2 there's no equivalent edge-runtime hook bundled with the
// hosting product, so we enforce it per-handler. The check itself is cheap
// (one string compare) and keeps credential handling in the Lambda's own
// secret environment.

import { header, json } from "./lambda.js";

/**
 * @returns {boolean} true if the request carried valid Basic Auth.
 */
export function isAdminAuthorized(event) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    // Treat unconfigured as "not authorized" — handler will return 503.
    return false;
  }
  const auth = header(event, "authorization");
  if (!auth) return false;
  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  return auth === expected;
}

/** 401 Unauthorized with WWW-Authenticate so browsers show the prompt. */
export function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: {
      "www-authenticate": 'Basic realm="Admin"',
      "cache-control": "no-store",
    },
    body: "Authentication required",
  };
}

/** 503 when ADMIN_USERNAME / ADMIN_PASSWORD aren't configured. */
export function notConfiguredResponse() {
  return json(503, { error: "admin_auth_not_configured" });
}

/**
 * Convenience guard for admin handlers: call at top of handler, return its
 * value to short-circuit on auth failure, or undefined to continue.
 *
 *   const block = requireAdmin(event);
 *   if (block) return block;
 */
export function requireAdmin(event) {
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return notConfiguredResponse();
  }
  if (!isAdminAuthorized(event)) {
    return unauthorizedResponse();
  }
  return undefined;
}
