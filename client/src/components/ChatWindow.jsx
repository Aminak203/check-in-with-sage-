import { useEffect, useRef, useState } from "react";
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
  // Indices of assistant messages whose audio hasn't started yet — shown as a
  // typing bubble until the voice begins, so text and speech appear together.
  const [pendingSpeak, setPendingSpeak] = useState([]);
  const revealTimers = useRef({});

  const reveal = (idx) => {
    setPendingSpeak((p) => p.filter((x) => x !== idx));
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
  }, [messages, isLoading, showDistressScale, pendingSpeak]);

  useEffect(() => {
    setOnStateChange((state) => setSpeaking(state));
  }, []);

  // When the user sends a new message, cut off the previous response's audio
  // instead of letting it play on from where it left off. Also flush any text
  // still held behind a typing bubble so it never gets stuck.
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user") return;
    stopSpeaking();
    Object.values(revealTimers.current).forEach(clearTimeout);
    revealTimers.current = {};
    setPendingSpeak([]);
  }, [messages]);

  useEffect(() => {
    if (isLoading) return;
    const idx = messages.length - 1;
    const lastMsg = messages[idx];
    if (idx <= lastSpokenIndex.current || !lastMsg || lastMsg.role !== "assistant") return;
    lastSpokenIndex.current = idx;

    if (isMuted()) {
      // No audio to sync to — just speak (no-op) and leave the text visible.
      speak(lastMsg.content, { calm: therapyMode });
    } else if (lastMsg.isGreeting) {
      // The greeting is the first thing users see (and the login click has
      // already granted audio permission) — voice it, but keep it visible
      // immediately rather than holding it behind a typing bubble.
      speak(lastMsg.content, { calm: false });
    } else {
      // Hold the text until this message's audio actually starts.
      setPendingSpeak((p) => [...p, idx]);
      revealTimers.current[idx] = setTimeout(() => reveal(idx), REVEAL_FALLBACK_MS);
      speak(lastMsg.content, { calm: therapyMode, onStart: () => reveal(idx) });
    }
  }, [messages, isLoading, therapyMode]);

  useEffect(() => {
    return () => {
      stopSpeaking();
      Object.values(revealTimers.current).forEach(clearTimeout);
      revealTimers.current = {};
    };
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (next) {
      stopSpeaking();
      // Muting stops audio, so nothing will trigger a reveal — show any held text now.
      Object.values(revealTimers.current).forEach(clearTimeout);
      revealTimers.current = {};
      setPendingSpeak([]);
    }
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className={`avatar ${speaking ? "speaking" : ""}`}>🌿</div>
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
        {messages.map((msg, i) =>
          pendingSpeak.includes(i) ? (
            // Awaiting audio — show a typing bubble so text lands with the voice.
            <div key={i} className="message bot">
              <div className="bubble typing">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          ) : (
            <MessageBubble key={i} message={msg} />
          )
        )}
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
        {showHypnoOffer && !hypnoPlaying && (
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