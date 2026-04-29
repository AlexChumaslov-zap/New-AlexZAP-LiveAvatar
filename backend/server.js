import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const {
  LIVEAVATAR_API_KEY,
  LIVEAVATAR_API_BASE = 'https://api.liveavatar.com',
  LIVEAVATAR_AVATAR_ID,
  LIVEAVATAR_CONTEXT_ID,
  PORT = 3001,
} = process.env;

if (!LIVEAVATAR_API_KEY) {
  console.error('Missing LIVEAVATAR_API_KEY in .env');
  process.exit(1);
}
if (!LIVEAVATAR_AVATAR_ID) {
  console.error('Missing LIVEAVATAR_AVATAR_ID in .env');
  process.exit(1);
}
if (!LIVEAVATAR_CONTEXT_ID) {
  console.warn(
    '[WARN] LIVEAVATAR_CONTEXT_ID is empty. Avatar will be SILENT.\n' +
      '       Run `npm run setup:context` to create one.',
  );
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    avatarId: LIVEAVATAR_AVATAR_ID,
    contextConfigured: Boolean(LIVEAVATAR_CONTEXT_ID),
  });
});

// Creates a session token for the FULL Mode sandbox avatar.
// Returns ONLY session_token + session_id to the client.
// The Web SDK consumes session_token and handles /sessions/start + LiveKit.
app.post('/api/session/token', async (_req, res) => {
  try {
    const response = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
      method: 'POST',
      headers: {
        'X-API-KEY': LIVEAVATAR_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'FULL',
        is_sandbox: true,
        avatar_id: LIVEAVATAR_AVATAR_ID,
        avatar_persona: {
          ...(LIVEAVATAR_CONTEXT_ID && { context_id: LIVEAVATAR_CONTEXT_ID }),
          language: 'en',
        },
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[token] LiveAvatar error', response.status, body);
      return res.status(response.status).json({
        error: 'liveavatar_token_failed',
        status: response.status,
        details: body,
      });
    }

    const data = body?.data ?? {};
    return res.json({
      session_id: data.session_id,
      session_token: data.session_token,
    });
  } catch (err) {
    console.error('[token] unexpected error', err);
    return res.status(500).json({ error: 'unexpected', message: String(err) });
  }
});

app.listen(Number(PORT), () => {
  console.log(`backend listening on http://localhost:${PORT}`);
  console.log(`  avatar_id:  ${LIVEAVATAR_AVATAR_ID}`);
  console.log(`  context_id: ${LIVEAVATAR_CONTEXT_ID || '(none — avatar will be silent)'}`);
});
