// Local verification for the sessionToken handler's UUID-validation fix.
// Stubs global fetch so we can inspect the body sent to HeyGen for various
// VOICE_ID / CONTEXT_ID values. No real API calls.
//
// Run with: node scripts/test-session-token.mjs

const fixtures = [
  {
    name: "valid UUIDs for both",
    env: {
      LIVEAVATAR_VOICE_ID: "11111111-2222-3333-4444-555555555555",
      LIVEAVATAR_CONTEXT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    },
    expect: { voice_id: true, context_id: true },
  },
  {
    name: "<unset> placeholder for voice (the user's actual case)",
    env: {
      LIVEAVATAR_VOICE_ID: "<unset>",
      LIVEAVATAR_CONTEXT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    },
    expect: { voice_id: false, context_id: true },
  },
  {
    name: "literal string 'none' for voice",
    env: {
      LIVEAVATAR_VOICE_ID: "none",
      LIVEAVATAR_CONTEXT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    },
    expect: { voice_id: false, context_id: true },
  },
  {
    name: "Empty string for both",
    env: {
      LIVEAVATAR_VOICE_ID: "",
      LIVEAVATAR_CONTEXT_ID: "",
    },
    expect: { voice_id: false, context_id: false },
  },
  {
    name: "VOICE_ID is UUID but CONTEXT_ID is placeholder",
    env: {
      LIVEAVATAR_VOICE_ID: "11111111-2222-3333-4444-555555555555",
      LIVEAVATAR_CONTEXT_ID: "<unset>",
    },
    expect: { voice_id: true, context_id: false },
  },
  {
    name: "Valid UUID with wrong case (uppercase)",
    env: {
      LIVEAVATAR_VOICE_ID: "11111111-2222-3333-4444-555555555555".toUpperCase(),
      LIVEAVATAR_CONTEXT_ID: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    },
    expect: { voice_id: true, context_id: true },
  },
  {
    name: "UUID with surrounding whitespace",
    env: {
      LIVEAVATAR_VOICE_ID: " 11111111-2222-3333-4444-555555555555 ",
      LIVEAVATAR_CONTEXT_ID: " aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee ",
    },
    // We want to know — the regex is strict, so whitespace will reject.
    // Flagged as expected:false to confirm; if user's secrets have spaces
    // we'd need to trim. Reporting truth, not aspiration.
    expect: { voice_id: false, context_id: false },
  },
];

// Capture every fetch call
let captured = null;
globalThis.fetch = async (url, opts) => {
  captured = { url, body: JSON.parse(opts?.body ?? "{}") };
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: { session_id: "stub", session_token: "stub" } }),
  };
};

// Required env (handler refuses to run without these)
process.env.LIVEAVATAR_API_KEY = "stub-key";
process.env.LIVEAVATAR_AVATAR_ID = "stub-avatar";

const { handler } = await import("../amplify/functions/sessionToken/handler.js");

let failures = 0;
for (const fx of fixtures) {
  process.env.LIVEAVATAR_VOICE_ID = fx.env.LIVEAVATAR_VOICE_ID;
  process.env.LIVEAVATAR_CONTEXT_ID = fx.env.LIVEAVATAR_CONTEXT_ID;
  // Make rate limiter a no-op so we can run multiple cases
  process.env.RATE_LIMIT_DISABLED = "1";
  captured = null;

  const event = {
    requestContext: { http: { method: "POST" } },
    headers: { "x-forwarded-for": "127.0.0.1" },
    body: "",
  };
  await handler(event);

  if (!captured) {
    console.log(`✗ ${fx.name}: fetch was never called`);
    failures++;
    continue;
  }
  const persona = captured.body.avatar_persona ?? {};
  const got = {
    voice_id: "voice_id" in persona,
    context_id: "context_id" in persona,
  };
  const ok =
    got.voice_id === fx.expect.voice_id &&
    got.context_id === fx.expect.context_id;
  console.log(
    `${ok ? "✓" : "✗"} ${fx.name}\n   expected ${JSON.stringify(fx.expect)} got ${JSON.stringify(got)}`,
  );
  if (!ok) failures++;
}

console.log(
  `\n${failures === 0 ? "✓ all" : `✗ ${failures}/${fixtures.length}`} cases match expected behavior`,
);
process.exit(failures === 0 ? 0 : 1);
