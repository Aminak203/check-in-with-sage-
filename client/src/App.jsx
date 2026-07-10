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
  // Hypnotherapy / relaxation runner state
  const [showHypnoOffer, setShowHypnoOffer] = useState(false);
  const [hypnoScript, setHypnoScript] = useState(null);
  const [hypnoStep, setHypnoStep] = useState(0);
  const [hypnoPlaying, setHypnoPlaying] = useState(false);
  const [hypnoPaused, setHypnoPaused] = useState(false);
  const timerRef = useRef(null);
  const eftTimerRef = useRef(null);
  const eftAutoPlayRef = useRef(false);
  const hypnoTimerRef = useRef(null);
  const hypnoPlayingRef = useRef(false);
  const deliveredStepRef = useRef(-1);

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

  const appendAssistant = useCallback((content) => {
    const msg = { role: "assistant", content };
    const next = [...messagesRef.current, msg];
    setMessages(next);
    messagesRef.current = next;
  }, []);

  const stopHypno = useCallback(() => {
    if (hypnoTimerRef.current) clearTimeout(hypnoTimerRef.current);
    hypnoTimerRef.current = null;
    hypnoPlayingRef.current = false;
    deliveredStepRef.current = -1;
    setHypnoPlaying(false);
    setHypnoPaused(false);
    setHypnoScript(null);
    setHypnoStep(0);
    setTherapyMode(false);
  }, []);

  // Ask the server to pick the best-fitting script for the current state, then
  // start the deterministic runner. The LLM only chooses; playback is scripted.
  const startHypno = useCallback(async () => {
    setShowHypnoOffer(false);
    if (eftAutoPlayRef.current) stopEftAutoPlay();
    setIsLoading(true);
    try {
      const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
      const res = await fetch("http://localhost:3001/api/hypno/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await res.json();
      const script = data.script;
      if (!script || !Array.isArray(script.steps) || script.steps.length === 0) {
        appendAssistant("Let's just take a few slow breaths together instead. Breathe in… and out.");
        return;
      }
      appendAssistant(`Let's begin the ${script.name} exercise. Get comfortable, and just follow along with me.`);
      deliveredStepRef.current = -1;
      setHypnoScript(script);
      setHypnoStep(0);
      setTherapyMode(true);
      hypnoPlayingRef.current = true;
      setHypnoPaused(false);
      setHypnoPlaying(true);
    } catch (err) {
      console.error("Failed to start relaxation:", err);
      appendAssistant("I couldn't start the relaxation exercise just now. We can try again in a moment.");
    } finally {
      setIsLoading(false);
    }
  }, [appendAssistant, stopEftAutoPlay]);

  const toggleHypnoPause = () => {
    if (!hypnoPlayingRef.current) return;
    setHypnoPaused((prev) => !prev);
  };

  // Deterministic playback: deliver the current step (spoken via ChatWindow's
  // auto-speak), then advance after that step's pause. Re-runs on step change.
  useEffect(() => {
    if (!hypnoPlaying || hypnoPaused || !hypnoScript) return;

    const steps = hypnoScript.steps;
    if (hypnoStep >= steps.length) {
      appendAssistant("That completes the exercise. Take a moment to notice how you feel. Remember, I'm not a substitute for professional care — but I'm here whenever you need me.");
      stopHypno();
      return;
    }

    // Deliver each step exactly once (guards against pause/resume re-delivery).
    if (deliveredStepRef.current !== hypnoStep) {
      appendAssistant(steps[hypnoStep].text);
      deliveredStepRef.current = hypnoStep;
    }

    const pause = steps[hypnoStep].pauseMs || 12000;
    hypnoTimerRef.current = setTimeout(() => {
      setHypnoStep((s) => s + 1);
    }, pause);

    return () => {
      if (hypnoTimerRef.current) clearTimeout(hypnoTimerRef.current);
    };
  }, [hypnoPlaying, hypnoPaused, hypnoStep, hypnoScript, appendAssistant, stopHypno]);

  const sendMessage = useCallback(async (text) => {
    setPrefillText(null);
    if (!text.trim()) return;

    // Hide the distress scale as soon as the user sends anything
    setShowDistressScale(false);

    // A fresh user message supersedes any pending relaxation offer
    setShowHypnoOffer(false);

    // If user types manually during EFT auto-play, break out
    if (eftAutoPlayRef.current) {
      stopEftTimer();
      stopEftAutoPlay();
    }

    // If user types during a relaxation session, break out of it
    if (hypnoPlayingRef.current) {
      stopHypno();
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
        // Rating comes first in the triage flow. If the same reply also looks
        // like a relaxation offer, suppress the offer here — it should appear
        // in a later message, after the user has given their rating.
        setShowHypnoOffer(false);
        setTimeout(() => setShowDistressScale(true), 1000);
      } else if (data.offerHypno && !data.crisis) {
        // Mabel offered a guided relaxation — surface the "Begin" affordance
        setShowHypnoOffer(true);
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
  }, [stopEftTimer, saveSession, stopHypno]);

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
        showHypnoOffer={showHypnoOffer}
        onStartHypno={startHypno}
        hypnoPlaying={hypnoPlaying}
        hypnoPaused={hypnoPaused}
        onToggleHypnoPause={toggleHypnoPause}
      />
      <CrisisOverlay
        isOpen={showCrisis}
        onClose={() => setShowCrisis(false)}
      />
    </div>
  );
}
