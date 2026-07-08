import { useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import DistressScale from "./DistressScale";
import { speak, setMuted, isMuted, stopSpeaking, setOnStateChange } from "../utils/tts";

export default function ChatWindow({ messages, isLoading, onSend, onLock, onWipe, showDistressScale, onDistressSelect, onDistressClose, prefillText, therapyMode, eftAutoPlay, eftPaused, onToggleEftPause, showHypnoOffer, onStartHypno, hypnoPlaying, hypnoPaused, onToggleHypnoPause }) {
  const messagesEndRef = useRef(null);
  const lastSpokenIndex = useRef(-1);
  const [muted, setMutedState] = useState(isMuted());
  const [speaking, setSpeaking] = useState(false);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, showDistressScale]);

  useEffect(() => {
    setOnStateChange((state) => setSpeaking(state));
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const nonGreeting = messages.filter((m) => !m.isGreeting);
    const newCount = nonGreeting.length;
    if (newCount > lastSpokenIndex.current) {
      const lastMsg = nonGreeting[nonGreeting.length - 1];
      if (lastMsg && lastMsg.role === "assistant" && !lastMsg.isGreeting) {
        speak(lastMsg.content, { calm: therapyMode });
        lastSpokenIndex.current = newCount;
      } else {
        lastSpokenIndex.current = newCount;
      }
    }
  }, [messages, isLoading, therapyMode]);

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (next) stopSpeaking();
  };

  return (
    <div className="chat-window">
      <div className="chat-header">
        <div className={`avatar ${speaking ? "speaking" : ""}`}>🌿</div>
        <div className="header-info">
          <span className="header-name">Mabel</span>
          <span className="header-status">{speaking ? "Speaking..." : "Mental health support"}</span>
        </div>
        <div className="header-actions">
          <button className="header-btn" onClick={toggleMute} title={muted ? "Enable voice" : "Mute voice"}>{muted ? "🔇" : "🔊"}</button>
          {eftAutoPlay && (
            <button className="header-btn" onClick={onToggleEftPause} title={eftPaused ? "Resume EFT" : "Pause EFT"}>{eftPaused ? "▶️" : "⏸️"}</button>
          )}
          {hypnoPlaying && (
            <button className="header-btn" onClick={onToggleHypnoPause} title={hypnoPaused ? "Resume relaxation" : "Pause relaxation"}>{hypnoPaused ? "▶️" : "⏸️"}</button>
          )}
          <button className="header-btn" onClick={onLock} title="Lock session">🔒</button>
          <button className="header-btn" onClick={onWipe} title="Wipe all data">🗑️</button>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
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
          Mabel is not a substitute for professional mental health care.
        </div>
      </div>
    </div>
  );
}