import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
  VoiceChatEvent,
  VoiceChatState,
} from "@heygen/liveavatar-web-sdk";
import FloatingVideoPlayer from "./FloatingVideoPlayer.jsx";
import { extractYouTubeId, findVideoForMessage } from "./lib/videoSearch.js";

const KEEP_ALIVE_MS = 2 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 22 * 1000;
const HEALTH_PROBE_MS = 30 * 1000;
// Hard cap on a single avatar session, even with constant dialogue.
const MAX_SESSION_MS = 10 * 60 * 1000;

// Auto-end the session if no user/avatar activity for this long.
const IDLE_TIMEOUT_MS = 1 * 60 * 1000;
// Optional extension granted when the user clicks "Continue session"
// during the warning window. One-shot — only allowed once per session.
const EXTENSION_MS = 5 * 60 * 1000;
// Show the end-of-session warning banner this long before the cap fires.
const WARNING_BEFORE_END_MS = 20 * 1000;

const HEYGEN_FALLBACK_SHARE =
  "eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3NzJlN2EyNjU1MTA0ZjRjOGZhMDMwMDcz%0D%0AMzU5MDg4YiIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzc3MmU3YTI2NTUxMDRmNGM4ZmEwMzAwNzMzNTkwODhiL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImI0%0D%0ANzE2NDNmZTYzYzRiNmM4NzU5MjRmYWMxODFhNmYyIiwidXNlcm5hbWUiOiJmYjdiNjQ3MGI5Njg0%0D%0ANDJjOTgxZGM3OWUwNTQ1ZGQ5MyJ9";

function HeyGenFallback() {
  const containerRef = useRef(null);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const iframe = document.createElement("iframe");
    iframe.title = "HeyGen Streaming Embed";
    iframe.allow = "microphone";
    iframe.sandbox = "allow-scripts allow-forms allow-same-origin allow-popups";
    iframe.src = `https://labs.heygen.com/guest/streaming-embed?share=${HEYGEN_FALLBACK_SHARE}&inIFrame=1`;
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block;";
    node.appendChild(iframe);
    return () => {
      iframe.remove();
    };
  }, []);
  return <div ref={containerRef} className="fixed inset-0 bg-black" />;
}

function Spinner() {
  const [counter, setCounter] = useState(20);
  useEffect(() => {
    const id = setInterval(() => {
      setCounter((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="lds-spinner">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} />
      ))}
      <span className="counter">{counter}</span>
    </div>
  );
}

export default function App() {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const keepAliveTimerRef = useRef(null);
  const fallbackTimerRef = useRef(null);
  const maxDurationTimerRef = useRef(null);
  const idleTimerRef = useRef(null);
  const warningTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  // Persistence (Phase 2) — DB ids carried through the session so each
  // message can be attributed to the right Conversation row server-side.
  // Refs (not state) so SDK event closures captured at session start can
  // read the latest values without stale-closure issues.
  const conversationIdRef = useRef(null);
  const visitorIdRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | connecting | ready | stopped | error
  const [error, setError] = useState(null);
  const [voiceChatActive, setVoiceChatActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [avatarTalking, setAvatarTalking] = useState(false);
  const [userTalking, setUserTalking] = useState(false);
  const [textToSay, setTextToSay] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [apiHealthy, setApiHealthy] = useState("unknown"); // 'unknown' | 'ok' | 'down'
  const [endsInSeconds, setEndsInSeconds] = useState(null); // null | number — countdown shown during last 20s
  const [hasExtended, setHasExtended] = useState(false);
  const [transcript, setTranscript] = useState([]); // [{ id, role: 'user'|'avatar', text, timestamp }]
  const transcriptScrollRef = useRef(null);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  // Guards against the SDK echoing a typed send as a USER_TRANSCRIPTION event,
  // which would cause the message to appear twice in the chat.
  const pendingTypedMessageRef = useRef(null);
  // Buffers voice transcriptions for 3 s of silence before showing them,
  // giving the user time to finish their thought.
  const pendingTranscriptRef = useRef({ text: null, timer: null });
  const [floatingVideoId, setFloatingVideoId] = useState(null);

  // Visitor identity (Land 3a). Persisted in localStorage so returning visitors
  // are recognized. Land 3c will sync this to Postgres.
  const [visitor, setVisitor] = useState(() => {
    try {
      const raw = localStorage.getItem("liveavatar_visitor");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [showVisitorForm, setShowVisitorForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formError, setFormError] = useState(null);
  const [formIsSending, setFormIsSending] = useState(false);
  const [formStatus, setFormStatus] = useState(null); // null | 'success' | 'error'
  const formCloseTimerRef = useRef(null);

  function clearFallbackTimer() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function clearCountdown() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setEndsInSeconds(null);
  }

  function clearSessionTimers() {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    clearCountdown();
  }

  function endSessionDueToTimeout(reason) {
    console.warn(`Auto-ending session: ${reason}`);
    fetch("/api/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "session_auto_ended",
        reason,
        source: "client_timer",
      }),
    }).catch(() => {});
    endChat(reason);
  }

  function resetIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(
      () => endSessionDueToTimeout("idle_timeout"),
      IDLE_TIMEOUT_MS,
    );
  }

  function startEndCountdown() {
    const startSeconds = Math.ceil(WARNING_BEFORE_END_MS / 1000);
    setEndsInSeconds(startSeconds);
    if (countdownIntervalRef.current)
      clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setEndsInSeconds((s) => (s !== null && s > 1 ? s - 1 : 0));
    }, 1000);
  }

  function armMaxDurationTimer(durationMs) {
    if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningTimerRef.current = setTimeout(
      startEndCountdown,
      Math.max(0, durationMs - WARNING_BEFORE_END_MS),
    );
    maxDurationTimerRef.current = setTimeout(
      () => endSessionDueToTimeout("max_session_duration"),
      durationMs,
    );
  }

  function continueSession() {
    if (hasExtended) return; // one-time extension only
    setHasExtended(true);
    clearCountdown();
    armMaxDurationTimer(EXTENSION_MS);
    fetch("/api/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "session_extended", source: "user" }),
    }).catch(() => {});
  }

  // Append a finished message to the transcript. We only call this when an
  // utterance completes (full SDK *_TRANSCRIPTION event, or a typed message
  // from the user) — partial chunks are intentionally ignored.
  function addTranscriptMessage(role, text) {
    setTranscript((t) => [
      ...t,
      {
        id:
          (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
          `${Date.now()}-${Math.random()}`,
        role,
        text,
        timestamp: Date.now(),
      },
    ]);
  }

  function clearTranscript() {
    setTranscript([]);
  }

  // Commit any buffered voice transcript to the visible chat and cancel its
  // pending timer.  Called either when the 3-second silence window expires or
  // when the user starts speaking again (so the previous utterance isn't lost).
  function flushPendingTranscript() {
    if (pendingTranscriptRef.current.timer) {
      clearTimeout(pendingTranscriptRef.current.timer);
      pendingTranscriptRef.current.timer = null;
    }
    if (pendingTranscriptRef.current.text) {
      addTranscriptMessage("user", pendingTranscriptRef.current.text);
      persistMessage("user", pendingTranscriptRef.current.text);
      pendingTranscriptRef.current.text = null;
    }
  }

  // Persistence helpers (Phase 2). All best-effort: server-side persistence
  // failing must not block a conversation from happening on the client.

  async function persistVisitorUpsert() {
    const payload = {};
    if (visitor?.id) payload.existingId = visitor.id;
    if (visitor?.name) payload.name = visitor.name;
    if (visitor?.email) payload.email = visitor.email;
    if (visitor?.company) payload.company = visitor.company;
    try {
      const r = await fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) return null;
      const v = await r.json();
      // Server is the source of truth for visitor.id / firstVisit / lastVisit;
      // mirror its response back into local state + storage.
      setVisitor(v);
      visitorIdRef.current = v.id;
      try {
        localStorage.setItem("liveavatar_visitor", JSON.stringify(v));
      } catch {
        /* ignore quota / private mode */
      }
      return v;
    } catch {
      return null;
    }
  }

  async function persistConversationStart(visitorId) {
    if (!visitorId) return;
    try {
      const r = await fetch("/api/conversation/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId }),
      });
      if (!r.ok) return;
      const c = await r.json();
      conversationIdRef.current = c.id;
    } catch {
      /* swallow — best-effort */
    }
  }

  async function persistMessage(role, text) {
    const cid = conversationIdRef.current;
    if (!cid || !text) return;
    try {
      await fetch("/api/conversation/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid, role, text }),
      });
    } catch {
      /* swallow */
    }
  }

  async function persistConversationEnd(reason) {
    const cid = conversationIdRef.current;
    if (!cid) return;
    try {
      await fetch("/api/conversation/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: cid, reason }),
      });
    } catch {
      /* swallow */
    } finally {
      conversationIdRef.current = null;
    }
  }

  // Visitor capture (Land 3a). The "Tell us about you" form is opened only
  // from the email-export button during/after a conversation — never from
  // Talk. Land 3d will hook the form's submit to the email-transcript send.
  function handleEmailClick() {
    setFormName(visitor?.name ?? "");
    setFormEmail(visitor?.email ?? "");
    setFormCompany(visitor?.company ?? "");
    setFormError(null);
    setFormStatus(null);
    setFormIsSending(false);
    setShowVisitorForm(true);
  }

  function closeVisitorForm() {
    if (formIsSending) return; // don't allow close mid-send
    if (formCloseTimerRef.current) {
      clearTimeout(formCloseTimerRef.current);
      formCloseTimerRef.current = null;
    }
    setShowVisitorForm(false);
    setFormStatus(null);
    setFormError(null);
  }

  async function handleVisitorSubmit(e) {
    e.preventDefault();
    setFormError(null);

    const name = formName.trim();
    const email = formEmail.trim();
    const company = formCompany.trim();

    if (!name || !email || !company) {
      setFormError("Please fill in all fields.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError("Please enter a valid email address.");
      return;
    }
    if (transcript.length === 0) {
      setFormError("There's no transcript to send yet.");
      return;
    }

    const nowIso = new Date().toISOString();
    const record = {
      id:
        visitor?.id ||
        (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
        `visitor-${Date.now()}`,
      name,
      email,
      company,
      firstVisit: visitor?.firstVisit ?? nowIso,
      lastVisit: nowIso,
    };

    try {
      localStorage.setItem("liveavatar_visitor", JSON.stringify(record));
    } catch {
      // localStorage may be unavailable (private mode, quota). Proceed anyway —
      // the in-memory state still works for the current session.
    }

    setVisitor(record);
    setFormIsSending(true);
    setFormStatus(null);

    // Upgrade the server-side Visitor with the just-collected info BEFORE
    // sending the email. Best-effort — failure here doesn't block email.
    try {
      const vr = await fetch("/api/visitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingId: record.id,
          name,
          email,
          company,
        }),
      });
      if (vr.ok) {
        const v = await vr.json();
        setVisitor(v);
        visitorIdRef.current = v.id;
        try {
          localStorage.setItem("liveavatar_visitor", JSON.stringify(v));
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* swallow — best-effort */
    }

    try {
      const r = await fetch("/api/email-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          transcript: transcript.map((m) => ({ role: m.role, text: m.text })),
          visitor: { name, company },
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        const reason = body?.error || `HTTP ${r.status}`;
        throw new Error(reason);
      }
      setFormIsSending(false);
      setFormStatus("success");
      // Auto-dismiss the success view after a short pause.
      formCloseTimerRef.current = setTimeout(() => {
        setShowVisitorForm(false);
        setFormStatus(null);
        formCloseTimerRef.current = null;
      }, 1500);
    } catch (err) {
      setFormIsSending(false);
      setFormStatus("error");
      setFormError(
        err?.message === "rate_limited"
          ? "You've sent several emails recently. Try again later."
          : "Couldn't send the email. Please try again.",
      );
    }
  }

  // Visitor modal renderer — used from both the ended screen and the active
  // session, so it's defined once here and called as `{renderVisitorModal()}`
  // wherever needed.
  function renderVisitorModal() {
    if (!showVisitorForm) return null;

    if (formStatus === "success") {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl mb-3">
              ✓
            </div>
            <h2 className="text-xl font-bold text-gray-900">Sent</h2>
            <p className="text-sm text-gray-600 mt-1">
              Check your inbox at{" "}
              <span className="font-medium">{formEmail}</span>.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <form
          onSubmit={handleVisitorSubmit}
          className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4"
        >
          <div>
            <h2 className="text-xl font-bold text-gray-900">Email transcript</h2>
            <p className="text-sm text-gray-600 mt-1">
              We'll send the transcript to this address.
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              required
              autoFocus
              disabled={formIsSending}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              required
              disabled={formIsSending}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Company</span>
            <input
              type="text"
              value={formCompany}
              onChange={(e) => setFormCompany(e.target.value)}
              required
              disabled={formIsSending}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </label>

          {formError && <p className="text-sm text-red-700">{formError}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={closeVisitorForm}
              disabled={formIsSending}
              className="flex-1 px-4 py-3 rounded-full bg-gray-200 text-gray-900 font-medium hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formIsSending}
              className="flex-1 px-4 py-3 rounded-full bg-gradient-to-tr from-red-600 to-red-950 text-white font-semibold hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300"
            >
              {formIsSending ? "Sending…" : "Send transcript"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  function showToast(message) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  function buildTranscriptText() {
    const fmt = (ts) =>
      new Date(ts).toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    return transcript
      .map(
        (m) =>
          `[${fmt(m.timestamp)}] ${m.role === "user" ? "You" : "Avatar"}:\n${m.text}`,
      )
      .join("\n\n");
  }

  function downloadTranscript() {
    if (transcript.length === 0) return;
    const text = buildTranscriptText();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liveavatar-transcript-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyTranscriptToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    } catch {
      showToast("Couldn't copy — try Download instead");
    }
  }

  async function shareTranscript() {
    if (transcript.length === 0) return;
    const text = buildTranscriptText();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "LiveAvatar conversation",
          text,
        });
      } catch (err) {
        // User cancelled the share sheet — leave silently.
        if (err?.name === "AbortError") return;
        // Anything else: fall back to clipboard so the user gets *something*.
        await copyTranscriptToClipboard(text);
      }
    } else {
      await copyTranscriptToClipboard(text);
    }
  }

  function triggerFallback(reason = null, source = "sdk_error") {
    clearFallbackTimer();
    clearSessionTimers();
    persistConversationEnd(`fallback:${source}`);
    try {
      sessionRef.current?.stop().catch(() => {});
    } catch (err) {
      console.warn("session.stop() threw during fallback", err);
    }
    if (reason) setError(reason);
    setUseFallback(true);
    fetch("/api/log-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "fallback_triggered", reason, source }),
    }).catch(() => {});
  }

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < window.innerHeight);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Keep visitorIdRef in sync with the visitor state (so values loaded from
  // localStorage on mount are available to event closures right away).
  useEffect(() => {
    visitorIdRef.current = visitor?.id ?? null;
  }, [visitor]);

  useEffect(() => {
    return () => {
      clearFallbackTimer();
      clearSessionTimers();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (formCloseTimerRef.current) clearTimeout(formCloseTimerRef.current);
      if (pendingTranscriptRef.current.timer)
        clearTimeout(pendingTranscriptRef.current.timer);
      sessionRef.current?.stop().catch(() => {});
    };
  }, []);

  // Best-effort: stop the session if the user closes the tab / navigates away.
  // Without this, sessions stay alive on HeyGen's side until their ~5 min cleanup,
  // wasting account quota and contributing to the concurrency limit.
  // pagehide fires reliably on iOS Safari (where beforeunload often doesn't).
  // Also closes the DB Conversation row via sendBeacon (survives unload).
  useEffect(() => {
    const stopOnUnload = () => {
      try {
        sessionRef.current?.stop();
      } catch {
        /* nothing we can do here */
      }
      const cid = conversationIdRef.current;
      if (cid && navigator.sendBeacon) {
        try {
          const blob = new Blob(
            [JSON.stringify({ conversationId: cid, reason: "page_unload" })],
            { type: "application/json" },
          );
          navigator.sendBeacon("/api/conversation/end", blob);
        } catch {
          /* swallow */
        }
      }
    };
    window.addEventListener("beforeunload", stopOnUnload);
    window.addEventListener("pagehide", stopOnUnload);
    return () => {
      window.removeEventListener("beforeunload", stopOnUnload);
      window.removeEventListener("pagehide", stopOnUnload);
    };
  }, []);

  // LinkedIn Insight Tag — injected via JS so Vite's HTML parser never sees
  // the env token, avoiding the "URI malformed" build error.
  useEffect(() => {
    const pid = import.meta.env.VITE_LINKEDIN_PARTNER_ID;
    if (!pid) return;
    window._linkedin_partner_id = pid;
    window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
    window._linkedin_data_partner_ids.push(pid);
    window.lintrk =
      window.lintrk ||
      function (a, b) {
        window.lintrk.q = window.lintrk.q || [];
        window.lintrk.q.push([a, b]);
      };
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = "https://snap.licdn.com/li.lms-analytics/insight.min.js";
    document.head.appendChild(s);
  }, []);

  // URL flag: ?forceFallback=1 → go straight to fallback iframe on page load (no Talk click needed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("forceFallback")) {
      triggerFallback(null, "forced_url_flag");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll the transcript to the newest message on every update.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  // Continuous health probe (30s). Pauses while in fallback.
  useEffect(() => {
    if (useFallback) return;
    let cancelled = false;
    async function probe() {
      try {
        const r = await fetch("/api/health");
        const data = await r.json().catch(() => ({}));
        if (!cancelled) setApiHealthy(data?.ok ? "ok" : "down");
      } catch {
        if (!cancelled) setApiHealthy("down");
      }
    }
    probe();
    const id = setInterval(probe, HEALTH_PROBE_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [useFallback]);

  async function connect() {
    if (apiHealthy === "down") {
      triggerFallback(
        "Health probe reports API is down",
        "proactive_probe_failed",
      );
      return;
    }

    setError(null);
    setUseFallback(false);
    setStatus("connecting");
    clearTranscript();
    conversationIdRef.current = null;

    // Best-effort: ensure we have a server-side Visitor row before the SDK
    // becomes ready. If this fails the conversation still happens client-side;
    // it just won't appear in the admin DB later.
    persistVisitorUpsert();

    fallbackTimerRef.current = setTimeout(() => {
      console.warn(
        `Connect timeout after ${CONNECT_TIMEOUT_MS}ms — switching to fallback`,
      );
      triggerFallback(
        `Connect timeout after ${CONNECT_TIMEOUT_MS / 1000}s`,
        "connect_timeout",
      );
    }, CONNECT_TIMEOUT_MS);

    try {
      const tokenRes = await fetch("/api/session/token", { method: "POST" });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(
          `Backend token request failed (${tokenRes.status}): ${JSON.stringify(body)}`,
        );
      }
      const { session_token } = await tokenRes.json();
      if (!session_token) throw new Error("Backend returned no session_token");

      const session = new LiveAvatarSession(session_token, { voiceChat: true });
      sessionRef.current = session;
      wireEvents(session);

      await session.start();
    } catch (e) {
      console.error(e);
      triggerFallback(e.message || String(e), "sdk_error");
    }
  }

  function wireEvents(session) {
    session.on(SessionEvent.SESSION_STREAM_READY, async () => {
      clearFallbackTimer();
      if (videoRef.current) session.attach(videoRef.current);
      setStatus("ready");

      keepAliveTimerRef.current = setInterval(() => {
        session
          .keepAlive()
          .catch((err) => console.warn("keepAlive failed", err));
      }, KEEP_ALIVE_MS);

      setHasExtended(false);
      armMaxDurationTimer(MAX_SESSION_MS);
      resetIdleTimer();

      // Persistence (Phase 2): start a Conversation row now that the SDK is
      // truly streaming. Best-effort — if persistVisitorUpsert hasn't yet
      // resolved, visitorIdRef will be null and we skip silently.
      persistConversationStart(visitorIdRef.current);

      try {
        await session.voiceChat.start();
        await session.voiceChat.unmute();
      } catch (err) {
        console.warn("auto-start mic failed", err);
      }
    });

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
      if (state === SessionState.DISCONNECTED) {
        clearSessionTimers();
        setStatus("stopped");
        setVoiceChatActive(false);
      }
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
      setAvatarTalking(true);
      resetIdleTimer();
    });
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () =>
      setAvatarTalking(false),
    );
    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => {
      // If a previous utterance is still in the 3-second silence buffer, flush
      // it now so it doesn't get lost when the new utterance begins.
      flushPendingTranscript();
      setUserTalking(true);
      resetIdleTimer();
    });
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => {
      setUserTalking(false);
      // Give the user 3 seconds of confirmed silence before their words appear
      // in the chat. flushPendingTranscript() will commit the buffered text.
      if (pendingTranscriptRef.current.timer) {
        clearTimeout(pendingTranscriptRef.current.timer);
      }
      pendingTranscriptRef.current.timer = setTimeout(
        flushPendingTranscript,
        3000,
      );
    });

    // We deliberately do NOT subscribe to *_TRANSCRIPTION_CHUNK events.
    // Streaming partial words appear before the speaker finishes their thought,
    // which reads as noise. The full *_TRANSCRIPTION events fire when the
    // utterance ends, which is the only moment we want to show the message.
    session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
      // If this text matches the most-recently typed message it means the SDK
      // is echoing the send — skip it to avoid showing the message twice.
      if (pendingTypedMessageRef.current === e.text) {
        pendingTypedMessageRef.current = null;
        return;
      }
      // Store the transcribed text.  It will be displayed once the 3-second
      // silence timer (started in USER_SPEAK_ENDED) fires.  If USER_SPEAK_ENDED
      // never fires (edge case), fall back to a standalone 4-second timer so
      // the message is never silently dropped.
      pendingTranscriptRef.current.text = e.text;
      if (!pendingTranscriptRef.current.timer) {
        pendingTranscriptRef.current.timer = setTimeout(
          flushPendingTranscript,
          4000,
        );
      }
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => {
      addTranscriptMessage("avatar", e.text);
      persistMessage("avatar", e.text);
      const vid = extractYouTubeId(e.text) || findVideoForMessage(e.text);
      if (vid) setFloatingVideoId(vid);
    });

    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (s) => {
      setVoiceChatActive(s === VoiceChatState.ACTIVE);
    });
    session.voiceChat.on(VoiceChatEvent.MUTED, () => setIsMuted(true));
    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setIsMuted(false));
  }

  async function sendMessage() {
    const text = textToSay.trim();
    if (!text || !sessionRef.current) return;
    try {
      // Add to the transcript immediately and persist — typed messages don't
      // go through the voice pipeline so we own the full lifecycle here.
      addTranscriptMessage("user", text);
      persistMessage("user", text);
      // Some SDK versions fire USER_TRANSCRIPTION for typed sends.  Guard
      // against that so the message doesn't appear twice in the chat.
      pendingTypedMessageRef.current = text;
      await sessionRef.current.message(text);
      setTextToSay("");
      resetIdleTimer();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    }
  }

  async function toggleMute() {
    if (!sessionRef.current) return;
    if (isMuted) {
      await sessionRef.current.voiceChat.unmute();
    } else {
      await sessionRef.current.voiceChat.mute();
    }
  }

  async function endChat(reason = "user_ended") {
    clearFallbackTimer();
    clearSessionTimers();
    // Close the DB Conversation row first so server-side state reflects
    // "ended" even if the SDK stop call hangs.
    persistConversationEnd(reason);
    try {
      await sessionRef.current?.stop();
    } catch (e) {
      console.warn(e);
    }
    setStatus("idle");
    setError(null);
    setTextToSay("");
    setUseFallback(false);
    setHasExtended(false);
    // Transcript is intentionally preserved so the visitor can review,
    // download, share, or email it from the ended screen. Cleared only when
    // they explicitly start a new chat (see startNewChat below).
  }

  function startNewChat() {
    clearTranscript();
    connect();
  }

  if (useFallback) {
    return <HeyGenFallback />;
  }

  const isReady = status === "ready";
  const sessionInactive = !isReady && status !== "connecting";
  const showEndedScreen = sessionInactive && transcript.length > 0;
  const showStartScreen = sessionInactive && transcript.length === 0;

  if (showEndedScreen) {
    return (
      <div className="start-bg fixed inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-black/75 backdrop-blur rounded-2xl shadow-2xl p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white">Conversation ended</h2>
            <p className="text-sm text-white/70 mt-1">
              Save or share the transcript before starting a new chat.
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg bg-white/5 p-3 space-y-2">
            {transcript.map((msg) => (
              <div
                key={msg.id}
                className={msg.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm text-left ${
                    msg.role === "user"
                      ? "bg-red-600/80 text-white"
                      : "bg-white/95 text-gray-900"
                  }`}
                >
                  {msg.role === "avatar" ? (
                    <div className="[&_p]:my-0 [&_p:not(:last-child)]:mb-2 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                  ) : (
                    msg.text
                  )}
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <button
              type="button"
              onClick={downloadTranscript}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium backdrop-blur transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Download
            </button>
            <button
              type="button"
              onClick={shareTranscript}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium backdrop-blur transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                />
              </svg>
              Share
            </button>
            <button
              type="button"
              onClick={handleEmailClick}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium backdrop-blur transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                />
              </svg>
              Email
            </button>
          </div>

          <button
            type="button"
            onClick={startNewChat}
            className="w-full px-4 py-3 rounded-full bg-gradient-to-tr from-red-600 to-red-950 text-white font-semibold hover:shadow-xl transition-all duration-300"
          >
            Start new chat
          </button>

          {toast && (
            <p className="text-center text-sm text-white/80">{toast}</p>
          )}
        </div>

        {renderVisitorModal()}
      </div>
    );
  }

  if (showStartScreen) {
    return (
      <div className="start-bg fixed inset-0 flex items-center justify-center md:items-end md:pb-16">
        <div className="flex flex-col items-center gap-6 px-6">
          <button
            type="button"
            onClick={connect}
            className="bg-gradient-to-tr from-red-600 to-red-950 text-white py-4 px-12 rounded-full font-semibold text-2xl hover:shadow-xl transition-all duration-300"
          >
            Talk
          </button>
          {visitor && (
            <p className="text-sm text-gray-700">
              Welcome back,{" "}
              <span className="font-semibold">{visitor.name}</span>
            </p>
          )}
          {error && (
            <p className="max-w-md text-sm text-red-700 text-center">{error}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {!isReady && (
        <div className="start-bg absolute inset-0 overflow-hidden flex items-center justify-center">
          <video
            key={isMobile ? "mob" : "desk"}
            ref={(el) => {
              if (!el) return;
              el.play().catch(() => {
                el.muted = true;
                el.play().catch(() => {});
              });
            }}
            autoPlay
            playsInline
            preload="auto"
            className="absolute inset-0 w-full h-full object-cover"
            src={isMobile ? "/AZa-intro-mob.mp4" : "/AZa-intro.mp4"}
          >
            <track kind="captions" />
          </video>
          <div className="relative z-10">
            <Spinner />
          </div>
        </div>
      )}

      {isReady && (
        <div className="absolute top-4 left-4 flex gap-2">
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium backdrop-blur ${
              avatarTalking
                ? "bg-emerald-500/80 text-white"
                : userTalking
                  ? "bg-sky-500/80 text-white"
                  : "bg-white/20 text-white"
            }`}
          >
            {avatarTalking
              ? "avatar speaking"
              : userTalking
                ? "you speaking"
                : "live"}
          </span>
        </div>
      )}

      {toast && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-black/80 text-white text-sm shadow-lg pointer-events-none z-20">
          {toast}
        </div>
      )}

      {isReady && endsInSeconds !== null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 w-full max-w-md pointer-events-none">
          <div className="bg-gradient-to-tr from-red-600 to-red-950 text-white rounded-full shadow-xl px-5 py-3 flex items-center justify-between gap-3 pointer-events-auto transition-all duration-300">
            <span className="text-sm font-semibold">
              The session ends after {endsInSeconds} second
              {endsInSeconds === 1 ? "" : "s"}
            </span>
            {!hasExtended && (
              <button
                type="button"
                onClick={continueSession}
                className="shrink-0 px-3 py-1.5 rounded-full bg-white text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
              >
                Continue session
              </button>
            )}
          </div>
        </div>
      )}

      {isReady && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          {transcript.length > 0 && (
            <div className="mx-auto max-w-3xl mb-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={downloadTranscript}
                title="Download transcript"
                aria-label="Download transcript"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={shareTranscript}
                title="Share transcript"
                aria-label="Share transcript"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={handleEmailClick}
                title="Email transcript"
                aria-label="Email transcript"
                className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white backdrop-blur transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.8}
                  stroke="currentColor"
                  className="w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"
                  />
                </svg>
              </button>
            </div>
          )}
          <div className="mx-auto max-w-3xl mb-3">
            <div
              ref={transcriptScrollRef}
              className="max-h-48 overflow-y-auto rounded-lg bg-black/50 backdrop-blur p-3 space-y-2"
            >
              {transcript.length === 0 ? (
                <p className="text-white/50 text-sm text-center italic">
                  Conversation will appear here…
                </p>
              ) : (
                transcript.map((msg) => (
                  <div
                    key={msg.id}
                    className={msg.role === "user" ? "text-right" : "text-left"}
                  >
                    <span
                      className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm text-left ${
                        msg.role === "user"
                          ? "bg-red-600/80 text-white"
                          : "bg-white/95 text-gray-900"
                      }`}
                    >
                      {msg.role === "avatar" ? (
                        <div className="[&_p]:my-0 [&_p:not(:last-child)]:mb-2 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="mx-auto max-w-3xl flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={textToSay}
              onChange={(e) => setTextToSay(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Type a message…"
              className="flex-1 min-w-[12rem] px-4 py-3 rounded-full bg-white/95 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!textToSay.trim()}
              className="px-5 py-3 rounded-full bg-white/90 text-gray-900 font-medium hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
            </button>
            {voiceChatActive && (
              <button
                type="button"
                onClick={toggleMute}
                className="px-5 py-3 rounded-full bg-white/20 text-white font-medium hover:bg-white/30 backdrop-blur transition-colors"
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            )}
            <button
              type="button"
              onClick={endChat}
              className="px-5 py-3 rounded-full bg-gradient-to-tr from-red-600 to-red-950 text-white font-semibold hover:shadow-lg transition-all duration-300"
            >
              End Chat
            </button>
          </div>
          {error && (
            <p className="mx-auto max-w-3xl mt-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>
      )}

      {floatingVideoId && (
        <FloatingVideoPlayer
          videoId={floatingVideoId}
          onClose={() => setFloatingVideoId(null)}
        />
      )}

      {renderVisitorModal()}
    </div>
  );
}
