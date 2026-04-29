import { useEffect, useRef, useState } from 'react';
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
  VoiceChatEvent,
  VoiceChatState,
} from '@heygen/liveavatar-web-sdk';

const KEEP_ALIVE_MS = 2 * 60 * 1000; // 2 minutes — well under the 5-min timeout

export default function App() {
  const videoRef = useRef(null);
  const sessionRef = useRef(null);
  const keepAliveTimerRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | connecting | ready | stopped | error
  const [error, setError] = useState(null);
  const [voiceChatActive, setVoiceChatActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [avatarTalking, setAvatarTalking] = useState(false);
  const [userTalking, setUserTalking] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [textToSay, setTextToSay] = useState('Tell me a fun fact about octopuses.');

  useEffect(() => {
    return () => {
      // unmount: best-effort cleanup
      if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current);
      sessionRef.current?.stop().catch(() => {});
    };
  }, []);

  async function connect() {
    setError(null);
    setStatus('connecting');
    setTranscript([]);

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
      setStatus('error');
    }
  }

  function wireEvents(session) {
    session.on(SessionEvent.SESSION_STREAM_READY, () => {
      if (videoRef.current) session.attach(videoRef.current);
      setStatus('ready');

      // keep-alive every 2 min — sandbox sessions are ~1 min anyway, but harmless
      keepAliveTimerRef.current = setInterval(() => {
        session.keepAlive().catch((err) => console.warn('keepAlive failed', err));
      }, KEEP_ALIVE_MS);
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

    session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
      setTranscript((t) => [...t, { who: 'user', text: e.text, ts: Date.now() }]);
    });
    session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => {
      setTranscript((t) => [...t, { who: 'avatar', text: e.text, ts: Date.now() }]);
    });

    session.voiceChat.on(VoiceChatEvent.STATE_CHANGED, (s) => {
      setVoiceChatActive(s === VoiceChatState.ACTIVE);
    });
    session.voiceChat.on(VoiceChatEvent.MUTED, () => setIsMuted(true));
    session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setIsMuted(false));
  }

  async function speakResponse() {
    const text = textToSay.trim();
    if (!text || !sessionRef.current) return;
    try {
      await sessionRef.current.message(text);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    }
  }

  async function speakVerbatim() {
    const text = textToSay.trim();
    if (!text || !sessionRef.current) return;
    try {
      await sessionRef.current.repeat(text);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    }
  }

  async function interrupt() {
    try {
      await sessionRef.current?.interrupt();
    } catch (e) {
      console.warn(e);
    }
  }

  async function startMic() {
    try {
      await sessionRef.current?.voiceChat.start();
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    }
  }

  async function stopMic() {
    try {
      await sessionRef.current?.voiceChat.stop();
    } catch (e) {
      console.warn(e);
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

  async function stop() {
    try {
      await sessionRef.current?.stop();
    } catch (e) {
      console.warn(e);
    }
  }

  const isReady = status === 'ready';

  return (
    <div className="app">
      <header>
        <h1>LiveAvatar Sandbox</h1>
        <span className={`status status-${status}`}>
          {status}
          {avatarTalking && ' • avatar speaking'}
          {userTalking && ' • you speaking'}
        </span>
      </header>

      <main className="grid">
        <section className="stage">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={isReady ? 'live' : 'placeholder'}
          />
          {!isReady && <div className="overlay">{statusOverlay(status)}</div>}
        </section>

        <section className="controls">
          {!isReady ? (
            <button onClick={connect} disabled={status === 'connecting'}>
              {status === 'connecting' ? 'Connecting…' : 'Connect to sandbox'}
            </button>
          ) : (
            <>
              <div className="row">
                <textarea
                  rows={3}
                  value={textToSay}
                  onChange={(e) => setTextToSay(e.target.value)}
                  placeholder="What should the avatar say or respond to?"
                />
              </div>
              <div className="row">
                <button onClick={speakResponse}>Send to LLM (message)</button>
                <button onClick={speakVerbatim}>Speak verbatim (repeat)</button>
                <button onClick={interrupt}>Interrupt</button>
              </div>
              <div className="row">
                {!voiceChatActive ? (
                  <button onClick={startMic}>Start mic</button>
                ) : (
                  <>
                    <button onClick={stopMic}>Stop mic</button>
                    <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
                  </>
                )}
                <button onClick={stop} className="danger">
                  End session
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="error">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="transcript">
            <h3>Transcript</h3>
            {transcript.length === 0 ? (
              <p className="muted">Nothing said yet.</p>
            ) : (
              <ul>
                {transcript.map((m, i) => (
                  <li key={i} className={`msg msg-${m.who}`}>
                    <span className="who">{m.who}:</span> {m.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>

      <footer>
        Sandbox sessions last about 1 minute and cost no credits. The opening
        line is set on the context (run <code>npm run setup:context</code> in the
        backend if the avatar is silent).
      </footer>
    </div>
  );
}

function statusOverlay(status) {
  switch (status) {
    case 'connecting':
      return 'Requesting session token, joining LiveKit…';
    case 'stopped':
      return 'Session ended. Click connect to start a new one.';
    case 'error':
      return 'Something went wrong — see the error below.';
    default:
      return 'Click Connect to start a sandbox session.';
  }
}
