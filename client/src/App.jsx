import { useState, useEffect, useRef, useCallback } from "react";
import ChatWindow from "./components/ChatWindow";
import CrisisOverlay from "./components/CrisisOverlay";
import LockScreen from "./components/LockScreen";
import { encryptData, clearStoredData } from "./utils/crypto";

const GREETING = {
  role: "assistant",
  content:
    "Hello, I'm Mabel. I'm here to listen and help you through whatever you're going through. What's been on your mind lately?",
  isGreeting: true,
};

const AUTO_LOCK_MS = 10 * 60 * 1000;
const EFT_STEP_DELAY = 12000; // ms between auto-sent "done" during EFT

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [messages, setMessages] = useState([GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [showDistressScale, setShowDistressScale] = useState(false);
  const [prefillText, setPrefillText] = useState(null);
  const [therapyMode, setTherapyMode] = useState(false);
  const [eftAutoPlay, setEftAutoPlay] = useState(false);
  const [eftPaused, setEftPaused] = useState(false);
  const timerRef = useRef(null);
  const eftTimerRef = useRef(null);
  const eftAutoPlayRef = useRef(false);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setMessages([GREETING]);
      setUnlocked(false);
      setPassphrase("");
    }, AUTO_LOCK_MS);
  }, []);

  const stopEftTimer = useCallback(() => {
    if (eftTimerRef.current) {
      clearTimeout(eftTimerRef.current);
      eftTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!eftAutoPlay || eftPaused) return;
    stopEftTimer();
    eftTimerRef.current = setTimeout(async () => {
      if (!eftAutoPlayRef.current || eftPaused) return;
      setIsLoading(true);
      try {
        const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
        apiMessages.push({ role: "user", content: "Continue to the next tapping point." });
        const res = await fetch("http://localhost:3001/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
        });
        const data = await res.json();
        const botMsg = { role: "assistant", content: data.reply };
        const finalMessages = [...messagesRef.current, botMsg];
        setMessages(finalMessages);
        messagesRef.current = finalMessages;

        if (data.crisis) setShowCrisis(true);
        if (data.requestRating) setTimeout(() => setShowDistressScale(true), 1000);

        const inTherapy = !!data.therapyMode;
        setTherapyMode(inTherapy);

        if (inTherapy && isTappingStep(data.reply)) {
          // Continue auto-play loop
        } else {
          stopEftAutoPlay();
        }
      } catch (err) {
        console.error("EFT auto-step error:", err);
        stopEftAutoPlay();
      } finally {
        setIsLoading(false);
      }
    }, EFT_STEP_DELAY);
    return () => stopEftTimer();
  }, [eftAutoPlay, eftPaused]);

  const isTappingStep = (text) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return /tap|tapping|eft|karate chop|collarbone|top of head|eyebrow point|side of eye|under the (eye|nose|arm)|chin|reminder phrase/.test(lower);
  };

  const toggleEftPause = () => {
    if (!eftAutoPlayRef.current) return;
    setEftPaused((prev) => !prev);
  };

  const startEftAutoPlay = () => {
    setEftAutoPlay(true);
    eftAutoPlayRef.current = true;
    setEftPaused(false);
  };

  const stopEftAutoPlay = () => {
    setEftAutoPlay(false);
    eftAutoPlayRef.current = false;
    stopEftTimer();
  };

  useEffect(() => {
    if (unlocked) resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [unlocked, resetTimer]);

  const saveSession = useCallback(
    async (msgs) => {
      if (!passphrase) return;
      const apiMessages = msgs.filter((m) => !m.isGreeting);
      try {
        const encrypted = await encryptData(apiMessages, passphrase);
        localStorage.setItem("mabel_session", encrypted);
        localStorage.setItem("mabel_created", Date.now().toString());
      } catch (e) {
        console.error("Failed to save session:", e);
      }
    },
    [passphrase]
  );

  const handleUnlock = async (session, phrase) => {
    setPassphrase(phrase);
    setUnlocked(true);
    if (session && session.length > 0) {
      setMessages([GREETING, ...session]);
    }
  };

  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    setPrefillText(null);
    if (!text.trim()) return;

    // Hide the distress scale as soon as the user sends anything
    setShowDistressScale(false);

    // If user types manually during EFT auto-play, break out
    if (eftAutoPlayRef.current) {
      stopEftTimer();
      stopEftAutoPlay();
    }

    const userMsg = { role: "user", content: text };
    const updatedMessages = [...messagesRef.current, userMsg];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const apiMessages = updatedMessages.filter((m) => !m.isGreeting);
      const res = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await res.json();
      const botMsg = { role: "assistant", content: data.reply };
      const finalMessages = [...updatedMessages, botMsg];
      setMessages(finalMessages);
      messagesRef.current = finalMessages;

      await saveSession(finalMessages);

      if (data.crisis) {
        setShowCrisis(true);
      }

      if (data.requestRating) {
        setTimeout(() => setShowDistressScale(true), 1000);
      }

      const inTherapy = !!data.therapyMode;
      setTherapyMode(inTherapy);

      if (inTherapy && isTappingStep(data.reply)) {
        if (!eftAutoPlayRef.current) {
          startEftAutoPlay();
        } else if (!eftPaused) {
          // Timer will restart via useEffect
        }
      } else if (inTherapy && !isTappingStep(data.reply)) {
        setEftAutoPlay(false);
        eftAutoPlayRef.current = false;
        stopEftTimer();
      } else if (!inTherapy) {
        stopEftAutoPlay();
      }
    } catch (err) {
      console.error("Failed to get response:", err);
      const errorMsg = {
        role: "assistant",
        content:
          "I'm sorry, I'm having trouble connecting right now. Please try again. If you need immediate help, please call Samaritans on 116 123.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [stopEftTimer, saveSession]);

  const handleLock = async () => {
    const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
    await saveSession(apiMessages);
    setMessages([GREETING]);
    setUnlocked(false);
    setPassphrase("");
  };

  const handleDistressSelect = (value) => {
    setShowDistressScale(false);
    setPrefillText(String(value));
  };

  const handleWipe = async () => {
    if (
      window.confirm(
        "This will permanently delete all session data. This cannot be undone."
      )
    ) {
      await clearStoredData();
      setMessages([GREETING]);
      setUnlocked(false);
      setPassphrase("");
    }
  };

  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="app">
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        onSend={sendMessage}
        onLock={handleLock}
        onWipe={handleWipe}
        showDistressScale={showDistressScale}
        onDistressSelect={handleDistressSelect}
        onDistressClose={() => setShowDistressScale(false)}
        prefillText={prefillText}
        therapyMode={therapyMode}
        eftAutoPlay={eftAutoPlay}
        eftPaused={eftPaused}
        onToggleEftPause={toggleEftPause}
      />
      <CrisisOverlay
        isOpen={showCrisis}
        onClose={() => setShowCrisis(false)}
      />
    </div>
  );
}
