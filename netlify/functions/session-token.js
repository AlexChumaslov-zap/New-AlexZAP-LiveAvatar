export const handler = async () => {
  const {
    LIVEAVATAR_API_KEY,
    LIVEAVATAR_API_BASE = 'https://api.liveavatar.com',
    LIVEAVATAR_AVATAR_ID,
    LIVEAVATAR_CONTEXT_ID,
  } = process.env;

  if (!LIVEAVATAR_API_KEY || !LIVEAVATAR_AVATAR_ID) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'missing_env' }),
    };
  }

  try {
    const r = await fetch(`${LIVEAVATAR_API_BASE}/v1/sessions/token`, {
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

    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        statusCode: r.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'liveavatar_token_failed',
          status: r.status,
          details: body,
        }),
      };
    }

    const data = body?.data ?? {};
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: data.session_id,
        session_token: data.session_token,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'unexpected', message: String(err) }),
    };
  }
};
