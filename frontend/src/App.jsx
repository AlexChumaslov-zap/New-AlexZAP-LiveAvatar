import { useEffect, useRef, useState } from 'react';
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
  VoiceChatEvent,
  VoiceChatState,
} from '@heygen/liveavatar-web-sdk';

const KEEP_ALIVE_MS = 2 * 60 * 1000;
const CONNECT_TIMEOUT_MS = 22 * 1000;

const HEYGEN_FALLBACK_SHARE =
  'eyJxdWFsaXR5IjoiaGlnaCIsImF2YXRhck5hbWUiOiI3NzJlN2EyNjU1MTA0ZjRjOGZhMDMwMDcz%0D%0AMzU5MDg4YiIsInByZXZpZXdJbWciOiJodHRwczovL2ZpbGVzMi5oZXlnZW4uYWkvYXZhdGFyL3Yz%0D%0ALzc3MmU3YTI2NTUxMDRmNGM4ZmEwMzAwNzMzNTkwODhiL2Z1bGwvMi4yL3ByZXZpZXdfdGFyZ2V0%0D%0ALndlYnAiLCJuZWVkUmVtb3ZlQmFja2dyb3VuZCI6ZmFsc2UsImtub3dsZWRnZUJhc2VJZCI6ImI0%0D%0ANzE2NDNmZTYzYzRiNmM4NzU5MjRmYWMxODFhNmYyIiwidXNlcm5hbWUiOiJmYjdiNjQ3MGI5Njg0%0D%0ANDJjOTgxZGM3OWUwNTQ1ZGQ5MyJ9';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function HeyGenFallback({ reason }) {
  const containerRef = useRef(null);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const iframe = document.createElement('iframe');
    iframe.title = 'HeyGen Streaming Embed';
    iframe.allow = 'microphone';
    iframe.sandbox = 'allow-scripts allow-forms allow-same-origin allow-popups';
    iframe.src = `https://labs.heygen.com/guest/streaming-embed?share=${HEYGEN_FALLBACK_SHARE}&inIFrame=1`;
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    node.appendChild(iframe);
    return () => {
      iframe.remove();
    };
  }, []);
  return (
    <div className="fixed inset-0 flex flex-col bg-black">
      <div className="bg-amber-500/95 text-amber-950 text-sm font-medium px-4 py-2 text-center">
        <span className="truncate">
          {reason
            ? `Live connection unavailable (${reason}) — using HeyGen hosted stream`
            : 'Live connection unavailable — using HeyGen hosted stream'}
        </span>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
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

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | stopped | error
  const [error, setError] = useState(null);
  const [voiceChatActive, setVoiceChatActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [avatarTalking, setAvatarTalking] = useState(false);
  const [userTalking, setUserTalking] = useState(false);
  const [textToSay, setTextToSay] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  function clearFallbackTimer() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }

  function triggerFallback() {
    clearFallbackTimer();
    try {
      sessionRef.current?.stop().catch(() => {});
    } catch (err) {
      console.warn('session.stop() threw during fallback', err);
    }
    setUseFallback(true);
  }

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < window.innerHeight);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
      clearFallbackTimer();
      sessionRef.current?.stop().catch(() => {});
    };
  }, []);

  async function connect() {
    setError(null);
    setUseFallback(false);
    setStatus('connecting');

    fallbackTimerRef.current = setTimeout(() => {
      console.warn(`Connect timeout after ${CONNECT_TIMEOUT_MS}ms — switching to fallback`);
      triggerFallback();
    }, CONNECT_TIMEOUT_MS);

    try {
      const tokenRes = await fetch('/api/session/token', { method: 'POST' });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        throw new Error(
          `Backend token request failed (${tokenRes.status}): ${JSON.stringify(body)}`,
        );
      }
      const { session_token } = await tokenRes.json();
      if (!session_token) throw new Error('Backend returned no session_token');

      const session = new LiveAvatarSession(session_token, { voiceChat: true });
      sessionRef.current = session;
      wireEvents(session);

      await session.start();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      triggerFallback();
    }
  }

  function wireEvents(session) {
    session.on(SessionEvent.SESSION_STREAM_READY, async () => {
      clearFallbackTimer();
      if (videoRef.current) session.attach(videoRef.current);
      setStatus('ready');

      keepAliveTimerRef.current = setInterval(() => {
        session.keepAlive().catch((err) => console.warn('keepAlive failed', err));
      }, KEEP_ALIVE_MS);

      try {
        await session.voiceChat.start();
        await session.voiceChat.unmute();
      } catch (err) {
        console.warn('auto-start mic failed', err);
      }
    });

    session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
      if (state === SessionState.DISCONNECTED) {
        if (keepAliveTimerRef.current) {
          clearInterval(keepAliveTimerRef.current);
          keepAliveTimerRef.current = null;
        }
        setStatus('stopped');
        setVoiceChatActive(false);
      }
    });

    session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setAvatarTalking(true));
    session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => setAvatarTalking(false));
    session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => setUserTalking(true));
    session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => setUserTalking(false));

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
      await sessionRef.current.message(text);
      setTextToSay('');
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
    try {
      await sessionRef.current?.stop();
    } catch (e) {
      console.warn(e);
    }
    setStatus('idle');
    setError(null);
    setTextToSay('');
    setUseFallback(false);
  }

  if (useFallback) {
    return <HeyGenFallback reason={error} />;
  }

  const isReady = status === 'ready';
  const showStartScreen = !isReady && status !== 'connecting';

  if (showStartScreen) {
    return (
      <div className="start-bg fixed inset-0 flex items-center justify-center">
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
          {!isIOS() && (
            <video
              key={isMobile ? 'mob' : 'desk'}
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
              src={isMobile ? '/AZa-intro-mob.mp4' : '/AZa-intro.mp4'}
            >
              <track kind="captions" />
            </video>
          )}
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
                ? 'bg-emerald-500/80 text-white'
                : userTalking
                  ? 'bg-sky-500/80 text-white'
                  : 'bg-white/20 text-white'
            }`}
          >
            {avatarTalking ? 'avatar speaking' : userTalking ? 'you speaking' : 'live'}
          </span>
        </div>
      )}

      {isReady && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="mx-auto max-w-3xl flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={textToSay}
              onChange={(e) => setTextToSay(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendMessage();
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
                {isMuted ? 'Unmute' : 'Mute'}
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
            <p className="mx-auto max-w-3xl mt-2 text-sm text-red-300">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
