import { useEffect, useLayoutEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import DistressScale from "./DistressScale";
import { speak, setMuted, isMuted, stopSpeaking, setOnStateChange } from "../utils/tts";

// If audio never starts (very slow synthesis, or it fails silently), reveal the
// held text anyway after this long so the conversation can never visually freeze.
const REVEAL_FALLBACK_MS = 6000;

export default function ChatWindow({ messages, isLoading, onSend, onLogout, showDistressScale, onDistressSelect, onDistressClose, prefillText, therapyMode, sessionCount, sessionGoal, showHypnoOffer, onStartHypno, hypnoPlaying, hypnoPaused, onToggleHypnoPause }) {
  const messagesEndRef = useRef(null);
  const lastSpokenIndex = useRef(-1);
  const [muted, setMutedState] = useState(isMuted());
  const [speaking, setSpeaking] = useState(false);
  // Per-message reveal fraction (0..1). Absent means "not started speaking yet":
  // a fresh assistant message stays held behind a typing bubble until its audio
  // begins (fraction 0), then reveals word-by-word in step with the voice (→ 1).
  // Deriving the held/reveal state from this map during render (not from an
  // effect) is what stops a new step flashing its full text for a frame.
  const [progress, setProgress] = useState({});
  const revealTimers = useRef({});

  const clearRevealTimer = (idx) => {
    if (revealTimers.current[idx]) {
      clearTimeout(revealTimers.current[idx]);
      delete revealTimers.current[idx];
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, showDistressScale, showHypnoOffer]);

  useEffect(() => {
    setOnStateChange((state) => setSpeaking(state));
  }, []);

  // When the user sends a new message, cut off the previous response's audio
  // instead of letting it play on. Marking everything already sent as fully
  // revealed (via the lastSpokenIndex bump + cleared progress) means no bubble
  // is left stuck as a typing indicator or frozen mid-reveal. Layout effect so
  // this settles before paint.
  useLayoutEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user") return;
    stopSpeaking();
    Object.keys(revealTimers.current).forEach(clearRevealTimer);
    setProgress({});
    lastSpokenIndex.current = messages.length - 1;
  }, [messages]);

  // Speak each newly-arrived assistant message. Layout effect so the speak/hold
  // bookkeeping is in place before paint.
  useLayoutEffect(() => {
    const idx = messages.length - 1;
    const lastMsg = messages[idx];
    if (idx <= lastSpokenIndex.current || !lastMsg || lastMsg.role !== "assistant") return;
    lastSpokenIndex.current = idx;

    if (isMuted()) {
      // No audio to sync to — just speak (no-op); the text shows in full.
      speak(lastMsg.content, { calm: therapyMode });
    } else if (lastMsg.isGreeting) {
      // The greeting is the first thing users see (and the login click has
      // already granted audio permission) — voice it, but show it in full
      // immediately rather than holding it behind a typing bubble.
      speak(lastMsg.content, { calm: false });
      setProgress((pr) => ({ ...pr, [idx]: 1 }));
    } else {
      // Held until audio starts (see the render below), then revealed in step
      // with the voice. Fallback reveals the full text if audio never starts.
      revealTimers.current[idx] = setTimeout(() => {
        setProgress((pr) => ({ ...pr, [idx]: 1 }));
      }, REVEAL_FALLBACK_MS);
      speak(lastMsg.content, {
        calm: therapyMode,
        onStart: () => {
          clearRevealTimer(idx);
          setProgress((pr) => ({ ...pr, [idx]: pr[idx] >= 1 ? 1 : 0 }));
        },
        onProgress: (f) => setProgress((pr) => ({ ...pr, [idx]: Math.max(pr[idx] || 0, f) })),
      });
    }
  }, [messages, therapyMode]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      Object.keys(revealTimers.current).forEach(clearRevealTimer);
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (next) {
      // Muting stops audio, so nothing will drive a reveal — show all text now.
      stopSpeaking();
      Object.keys(revealTimers.current).forEach(clearRevealTimer);
      setProgress({});
    }
  };

  // Index of the most recent assistant message — used to hold the Begin button
  // until Sorra has finished speaking the line that introduces it.
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  // Only surface the Begin button once its introducing line has been fully
  // spoken (or when muted, where there's no audio to wait on).
  const offerSpoken = muted || progress[lastAssistantIdx] >= 1;

  return (
    <div className="chat-window">
      <div className="chat-header">
        {/* Logo mark — decorative, since the name sits beside it in .header-name. */}
        <div className={`avatar ${speaking ? "speaking" : ""}`} aria-hidden="true" />
        <div className="header-info">
          <span className="header-name">Sorra</span>
          <span className="header-status">{speaking ? "Speaking..." : "Mental health support"}</span>
        </div>
        <div className="header-actions">
          {sessionCount > 0 && sessionGoal > 0 && (
            <div
              className="session-tracker"
              title={`Check-in ${Math.min(sessionCount, sessionGoal)} of ${sessionGoal} — we'll ask how Sorra's helping after ${sessionGoal}`}
            >
              {Array.from({ length: sessionGoal }).map((_, i) => (
                <span key={i} className={`session-dot ${i < sessionCount ? "filled" : ""}`} />
              ))}
            </div>
          )}
          <button className="header-btn" onClick={toggleMute} title={muted ? "Enable voice" : "Mute voice"}>{muted ? "🔇" : "🔊"}</button>
          {hypnoPlaying && (
            <button className="header-btn" onClick={onToggleHypnoPause} title={hypnoPaused ? "Resume relaxation" : "Pause relaxation"}>{hypnoPaused ? "▶️" : "⏸️"}</button>
          )}
          <button className="header-btn" onClick={onLogout} title="Log out">🚪</button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => {
          const spokenAssistant = msg.role === "assistant" && !msg.isGreeting && !muted;
          const frac = progress[i];
          // Held (typing bubble) until audio starts — derived from render state,
          // not an effect, so a fresh step never flashes its full text.
          const held = spokenAssistant && frac === undefined && i >= lastSpokenIndex.current;
          if (held) {
            return (
              <div key={i} className="message bot">
                <div className="bubble typing">
                  <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            );
          }
          return <MessageBubble key={i} message={msg} progress={spokenAssistant ? frac : undefined} />;
        })}
        {isLoading && (
          <div className="message bot">
            <div className="bubble typing">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}
        {showDistressScale && (
          <DistressScale onSelect={onDistressSelect} onClose={onDistressClose} />
        )}
        {showHypnoOffer && !hypnoPlaying && offerSpoken && (
          <div className="message bot">
            <div className="bubble hypno-offer">
              <button className="hypno-start-btn" onClick={onStartHypno}>
                ▶ Begin relaxation
              </button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-footer">
        <InputBar onSend={onSend} disabled={isLoading} prefillText={prefillText} />
        <div className="disclaimer">
          Sorra is not a substitute for professional mental health care.
        </div>
      </div>
    </div>
  );
}
