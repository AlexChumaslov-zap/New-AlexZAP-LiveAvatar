# LiveAvatar Sandbox Test

Minimal end-to-end LiveAvatar **FULL Mode** integration running against the free sandbox avatar. Stack: Vite + React frontend, a single Netlify Function for token minting, official `@heygen/liveavatar-web-sdk`.

```
frontend/                 Vite + React. Joins LiveKit, renders avatar video, handles UI.
netlify/functions/        One serverless function: session-token (holds the API key).
scripts/                  setup-context: one-off CLI to create a LiveAvatar context.
```

## One-time setup

```bash
# Netlify CLI (once per machine)
npm install -g netlify-cli

# Frontend deps
cd frontend && npm install && cd ..

# Root deps (for the setup-context script)
npm install

# Secrets
cp .env.example .env
# → open .env and fill in LIVEAVATAR_API_KEY

# Create a context (without one, the avatar streams video but stays silent)
npm run setup:context
# → writes LIVEAVATAR_CONTEXT_ID into .env
```

## Run it locally

One terminal:

```bash
npm run dev    # → http://localhost:8888
```

`netlify dev` boots the Vite dev server *and* the function, routing `/api/session/token` to the local function. Open http://localhost:8888 and click **Talk**.

### What to try

- **Talk** — starts a sandbox session; the mic auto-starts so you can speak right away.
- **Type a message + Send** — the avatar generates a response and speaks it.
- **End Chat** — closes the session and returns to the start screen.

If the LiveAvatar service is unavailable or you hit your account's session-concurrency limit, the app automatically falls back to a HeyGen guest streaming iframe after 22 seconds (or immediately on hard error).

Sandbox sessions are free and last about a minute. After that the avatar disconnects; click Talk again.

## Testing the fallback

Three ways to verify the fallback path works on staging or in dev:

| Scenario | How | Effect |
|---|---|---|
| One visitor → fallback (no infra change) | Append `?forceFallback=1` to the URL | That tab skips the Talk button entirely and loads the HeyGen iframe immediately. Logged as `source: forced_url_flag`. |
| All visitors → fallback (staging-wide) | Set `FORCE_API_DOWN=1` in Netlify env (or local `.env`), redeploy / restart `netlify dev` | Both `/api/session/token` and `/api/health` short-circuit. Frontend probe sees `down`, every Talk click goes to fallback. |
| Real-network failure | DevTools → Network → Block request URL → `api.liveavatar.com`, click Talk | SDK rejects, fallback triggers within seconds. Logged as `source: sdk_error`. |

Continuous monitoring runs in the background: the frontend polls `/api/health` every 30 seconds and pre-emptively switches to fallback if the LiveAvatar API stops responding. Once a visitor is in fallback, they stay there for the rest of the session — switchback only happens on the next visit / page reload, when the probe re-checks.

Server-side incident logging: every fallback transition POSTs to `/api/log-event`, which logs a structured JSON record. View these in the Netlify dashboard → **Functions** tab → click the `log-event` function → Logs.

## How the auth split works

| Endpoint                  | Where                            | Auth                               |
| ------------------------- | -------------------------------- | ---------------------------------- |
| `POST /v1/sessions/token` | Netlify Function (server-side)   | `X-API-KEY` (from Netlify env)     |
| `POST /v1/sessions/start` | frontend (handled by SDK)        | `Bearer <session_token>`           |
| LiveKit room join         | frontend (handled by SDK)        | `livekit_client_token`             |
| Keep-alive                | frontend (handled by SDK)        | `Bearer <session_token>`           |

The API key never leaves the function. The frontend only sees a per-session token.

## Deploy to Netlify

1. Push the repo to GitHub.
2. In Netlify: **Add new site → Import an existing project**, point it at the repo. Netlify reads `netlify.toml` automatically (build base = `frontend`, publish = `dist`, functions = `netlify/functions`).
3. **Site settings → Environment variables**, set:
   - `LIVEAVATAR_API_KEY`
   - `LIVEAVATAR_AVATAR_ID`
   - `LIVEAVATAR_CONTEXT_ID`
   (You can pipe these from GitHub Actions secrets via the Netlify deploy action if you prefer that workflow.)
4. Trigger a deploy. The static React app is served from CDN; the function runs on demand. The API key never appears in the deployed bundle.

## Troubleshooting

| Symptom                                    | Likely cause                                                        |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Avatar streams video but doesn't speak     | `LIVEAVATAR_CONTEXT_ID` missing — run `npm run setup:context`       |
| 401/403 from `/api/session/token`          | Bad / rotated API key — check `.env` (local) or Netlify env (prod)  |
| 403 / "sandbox not allowed"                | Account not enabled for sandbox — check the dashboard               |
| `Session concurrency limit reached`        | Too many open sessions on your account — wait ~5 min or end them    |
| Mic won't start                            | Browser blocked mic permission — allow it for the site              |
| Session ends after ~1 minute               | Expected. Sandbox sessions are short.                               |
| `netlify: command not found`               | Install with `npm i -g netlify-cli`                                 |

## Switching avatars (sandbox ↔ custom / production)

All avatar config is env-driven now — no code edits needed:

| Variable | Sandbox avatar | Custom / production avatar |
|---|---|---|
| `LIVEAVATAR_AVATAR_ID` | `dd73ea75-1218-4ef3-92ce-606d5f7fbc0a` (free sandbox) | Your avatar UUID from `GET /v1/avatars` or the dashboard |
| `LIVEAVATAR_SANDBOX` | `true` | leave blank (or `false`) — sandbox mode rejects non-sandbox avatars |
| `LIVEAVATAR_VOICE_ID` | leave blank | Required if your avatar is an **image** avatar; leave blank for video avatars |
| `LIVEAVATAR_CONTEXT_ID` | created via `npm run setup:context` | Your knowledge-base UUID |

After changing any of these on Netlify (Site settings → Environment variables), trigger a redeploy. Locally, restart `netlify dev`.
