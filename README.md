# LiveAvatar Sandbox Test

Minimal end-to-end LiveAvatar **FULL Mode** integration running against the free sandbox avatar. Stack: Node + Express backend, Vite + React frontend, official `@heygen/liveavatar-web-sdk`.

```
backend/   Node + Express. Holds the API key. Issues session tokens.
frontend/  Vite + React. Joins LiveKit, renders avatar video, handles UI.
```

## One-time setup

```bash
cd backend  && npm install
cd ../frontend && npm install
```

Then create a context (without one, the avatar streams video but stays silent):

```bash
cd ../backend
npm run setup:context
```

This writes `LIVEAVATAR_CONTEXT_ID` into `backend/.env`. Re-run only if you delete the line.

## Run it

Two terminals:

```bash
# terminal 1
cd backend && npm run dev      # → http://localhost:3001

# terminal 2
cd frontend && npm run dev     # → http://localhost:5173
```

Open http://localhost:5173 and click **Connect to sandbox**. You should see the sandbox avatar appear and speak its opening line within a few seconds.

### What to try

- **Send to LLM (`message`)** — the avatar generates a response and speaks it.
- **Speak verbatim (`repeat`)** — the avatar speaks the exact text you typed.
- **Start mic** — talks to it; the avatar responds. Mute / unmute as needed.
- **Interrupt** — cuts the avatar off mid-sentence.
- **End session** — closes the LiveKit room.

Sandbox sessions are free and last about a minute. After that the avatar disconnects; click Connect again.

## How the auth split works

| Endpoint                  | Where                     | Auth                               |
| ------------------------- | ------------------------- | ---------------------------------- |
| `POST /v1/sessions/token` | backend (`server.js`)     | `X-API-KEY` (the secret in `.env`) |
| `POST /v1/sessions/start` | frontend (handled by SDK) | `Bearer <session_token>`           |
| LiveKit room join         | frontend (handled by SDK) | `livekit_client_token`             |
| Keep-alive                | frontend (handled by SDK) | `Bearer <session_token>`           |

The API key never leaves the backend. The frontend only sees a per-session token.

## Troubleshooting

| Symptom                                | Likely cause                                                   |
| -------------------------------------- | -------------------------------------------------------------- |
| Avatar streams video but doesn't speak | `LIVEAVATAR_CONTEXT_ID` missing — run `npm run setup:context`  |
| 401 from `/v1/sessions/token`          | Bad / rotated API key in `backend/.env`                        |
| 403 / "sandbox not allowed"            | Account not enabled for sandbox — check the dashboard          |
| Mic won't start                        | Browser blocked mic permission — allow it for `localhost:5173` |
| Session ends after ~1 minute           | Expected. Sandbox sessions are short.                          |
| CORS errors in console                 | Hit the Vite URL (5173), not the backend URL directly          |

## Going to production

When ready to leave sandbox, in `backend/.env`:

1. Swap `LIVEAVATAR_AVATAR_ID` for your production avatar (`GET /v1/avatars` or dashboard).
2. In `backend/server.js`, remove `is_sandbox: true` from the token request body.
3. Image avatars require `voice_id` — add it to `avatar_persona` if your avatar isn't a video avatar.

That's it — same code, real avatar.
