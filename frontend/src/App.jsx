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
  const [transcript, setTranscript] = useState([]); // [{ id, role, text, status, timestamp }]
  const transcriptScrollRef = useRef(null);

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
    endChat();
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

  // Transcript helpers. Streaming model: while a role is mid-utterance the SDK
  // emits *_TRANSCRIPTION_CHUNK events with cumulative text; when the utterance
  // completes a *_TRANSCRIPTION event arrives. We update the trailing partial
  // entry of that role in place, then mark it complete.
  function appendTranscriptChunk(role, text) {
    setTranscript((t) => {
      const last = t[t.length - 1];
      if (last && last.role === role && last.status === "partial") {
        return [...t.slice(0, -1), { ...last, text }];
      }
      return [
        ...t,
        {
          id:
            (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
            `${Date.now()}-${Math.random()}`,
          role,
          text,
          status: "partial",
          timestamp: Date.now(),
        },
      ];
    });
  }

  function finalizeTranscriptMessage(role, text) {
    setTranscript((t) => {
      const last = t[t.length - 1];
      if (last && last.role === role && last.status === "partial") {
        return [
          ...t.slice(0, -1),
          { ...last, text, status: "complete" },
        ];
      }
      return [
        ...t,
        {
          id:
            (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
            `${Date.now()}-${Math.random()}`,
          role,
          text,
          status: "complete",
          timestamp: Date.now(),
        },
      ];
    });
  }

  function clearTranscript() {
    setTranscript([]);
  }

  function triggerFallback(reason = null, source = "sdk_error") {
    clearFallbackTimer();
    clearSessionTimers();
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

  useEffect(() => {
    return () => {
      clearFallbackTimer();
      clearSessionTimers();
      sessionRef.current?.stop().catch(() => {});
    };
  }, []);

  // Best-effort: stop the session if the user closes the tab / navigates away.
  // Without this, sessions stay alive on HeyGen's side until their ~5 min cleanup,
  // wasting account quota and contributing to the concurrency limit.
  // pagehide fires reliably on iOS Safari (where beforeunload often doesn't).
  useEffect(() => {
    const stopOnUnload = () => {
      try {
        sessionRef.current?.stop();
      } catch {
        /* nothing we can do here */
      }
    };
    window.addEventListener("beforeunload", stopOnUnload);
    window.addEventListener("pagehide", stopOnUnload);
    return () => {
      window.removeEventListener("beforeunload", stopOnUnload);
      window.removeEventListener("pagehide", stopOnUnload);
    };
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
      setUserTalking(true);
      resetIdleTimer();
    });
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => setUserTalking(false));

    session.on(AgentEventsEnum.USER_TRANSCRIPTION_CHUNK, (e) => {
      appendTranscriptChunk("user", e.text);
    });
    session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
      finalizeTranscriptMessage("user", e.text);
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION_CHUNK, (e) => {
      appendTranscriptChunk("avatar", e.text);
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => {
      finalizeTranscriptMessage("avatar", e.text);
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
      // Typed input doesn't emit USER_TRANSCRIPTION, so add it to the transcript directly.
      finalizeTranscriptMessage("user", text);
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

  async function endChat() {
    clearFallbackTimer();
    clearSessionTimers();
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
    clearTranscript();
  }

  if (useFallback) {
    return <HeyGenFallback />;
  }

  const isReady = status === "ready";
  const showStartScreen = !isReady && status !== "connecting";

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
                      } ${msg.status === "partial" ? "opacity-60" : ""}`}
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
    </div>
  );
}
