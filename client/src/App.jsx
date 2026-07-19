import { useState, useEffect, useRef, useCallback } from "react";
import ChatWindow from "./components/ChatWindow";
import CrisisOverlay from "./components/CrisisOverlay";
import AuthScreen from "./components/AuthScreen";
import FeedbackPrompt from "./components/FeedbackPrompt";
import { signOut, startSession, saveTranscript, getProfile, getPastSessions, saveSummary } from "./utils/supabase";

const GREETING = {
  role: "assistant",
  content:
    "Hello, I'm Sova. I'm here to listen and help you through whatever you're going through. What's been on your mind lately?",
  isGreeting: true,
};

const AUTO_LOCK_MS = 10 * 60 * 1000;
const SESSIONS_BEFORE_FEEDBACK = 5;

// Asked once, just before every guided relaxation, to gently prime a positive
// focus before the trance begins (Owen's steer).
const GRATITUDE_QUESTION =
  "Before we begin, let's gently shift your focus. Take a moment — what are three things you feel grateful for right now, however small?";
const GRATITUDE_ACK =
  "Thank you for sharing those — holding them in mind is a lovely way to begin.";

export default function App() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([GREETING]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCrisis, setShowCrisis] = useState(false);
  const [showDistressScale, setShowDistressScale] = useState(false);
  const [prefillText, setPrefillText] = useState(null);
  const [therapyMode, setTherapyMode] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  // Hypnotherapy / relaxation runner state
  const [showHypnoOffer, setShowHypnoOffer] = useState(false);
  const [hypnoScript, setHypnoScript] = useState(null);
  const [hypnoStep, setHypnoStep] = useState(0);
  const [hypnoPlaying, setHypnoPlaying] = useState(false);
  const [hypnoPaused, setHypnoPaused] = useState(false);
  const timerRef = useRef(null);
  const hypnoTimerRef = useRef(null);
  const hypnoPlayingRef = useRef(false);
  const deliveredStepRef = useRef(-1);
  const sessionIdRef = useRef(null);
  // True only on the user's very first ever session — the server uses this to
  // add a brief nervous-system / gratitude explainer to Sova's first check-in.
  const firstSessionRef = useRef(false);
  // Between tapping "Begin" and the trance starting, we ask the client to name a
  // few things they're grateful for (Owen's steer: prime that part of the brain
  // before the relaxation). While true, the next typed message is that answer.
  const awaitingGratitudeRef = useRef(false);
  // Short recaps of this user's recent past sessions, sent to the server so Sova
  // can gently recall them ("last time you mentioned…"). Built once on login.
  const memoryRef = useRef([]);

  // On login, assemble the cross-session memory: pull recent past sessions,
  // lazily summarize any that don't have a recap yet, and keep the latest couple
  // to send to Sova. Runs in the background — if it's not ready by the first
  // message, that message simply goes out without recall. Never blocks the UI.
  const buildMemory = useCallback(async (userId, currentSessionId) => {
    try {
      const past = await getPastSessions(userId, currentSessionId, 5);
      const withContent = past.filter(
        (s) => Array.isArray(s.transcript) && s.transcript.some((m) => m.role === "user")
      );
      // Summarize at most the 3 most recent that still lack a recap (bounds cost).
      for (const s of withContent.slice(0, 3)) {
        if (s.summary && s.summary.trim()) continue;
        try {
          const res = await fetch("/api/summarize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transcript: s.transcript }),
          });
          const data = await res.json();
          s.summary = (data.summary || "").trim();
          if (s.summary) await saveSummary(s.id, s.summary);
        } catch (e) {
          console.error("Failed to summarize a past session:", e);
        }
      }
      // Recall the two most recent non-empty summaries.
      memoryRef.current = withContent
        .map((s) => s.summary)
        .filter((x) => x && x.trim())
        .slice(0, 2);
    } catch (e) {
      console.error("Failed to build session memory:", e);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
    if (apiMessages.length) await saveTranscript(sessionIdRef.current, apiMessages);
    await signOut();
    sessionIdRef.current = null;
    memoryRef.current = [];
    setUser(null);
    setShowFeedback(false);
    setSessionCount(0);
    setMessages([GREETING]);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleLogout();
    }, AUTO_LOCK_MS);
  }, [handleLogout]);

  useEffect(() => {
    if (user) resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  // Persist the running conversation onto the current Supabase session row.
  const saveSession = useCallback(async (msgs) => {
    const apiMessages = msgs.filter((m) => !m.isGreeting);
    try {
      await saveTranscript(sessionIdRef.current, apiMessages);
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  }, []);

  // Called once on successful login/signup: opens a new session row (a login =
  // one session) and, once they hit the milestone, surfaces the feedback form.
  const handleAuth = useCallback(async (authUser) => {
    setUser(authUser);
    setMessages([GREETING]);
    try {
      const { session, sessionCount } = await startSession(authUser.id);
      sessionIdRef.current = session.id;
      // sessionCount includes the row we just inserted, so 1 = first ever visit.
      firstSessionRef.current = sessionCount === 1;
      setSessionCount(sessionCount);
      // Build cross-session recall in the background (skipped on a first visit).
      if (sessionCount > 1) buildMemory(authUser.id, session.id);
      const profile = await getProfile(authUser.id);
      if (sessionCount >= SESSIONS_BEFORE_FEEDBACK && !profile?.feedback_submitted) {
        setShowFeedback(true);
      }
    } catch (e) {
      console.error("Failed to start session:", e);
    }
  }, [buildMemory]);

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

  // Tapping "Begin" doesn't go straight into the trance: first we ask the client
  // to name a few things they're grateful for. The next message they send is
  // treated as that answer (see sendMessage), which then kicks off startHypno.
  const promptGratitude = useCallback(() => {
    setShowHypnoOffer(false);
    awaitingGratitudeRef.current = true;
    appendAssistant(GRATITUDE_QUESTION);
  }, [appendAssistant]);

  // Ask the server to pick the best-fitting script for the current state, then
  // start the deterministic runner. The LLM only chooses; playback is scripted.
  const startHypno = useCallback(async () => {
    setShowHypnoOffer(false);
    setIsLoading(true);
    try {
      const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
      const res = await fetch("/api/hypno/select", {
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
  }, [appendAssistant]);

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

    // If we're waiting on the pre-trance gratitude answer, treat this message as
    // that answer: record it, acknowledge warmly, then start the relaxation.
    if (awaitingGratitudeRef.current) {
      awaitingGratitudeRef.current = false;
      const userMsg = { role: "user", content: text };
      const updated = [...messagesRef.current, userMsg];
      setMessages(updated);
      messagesRef.current = updated;
      appendAssistant(GRATITUDE_ACK);
      await saveSession(messagesRef.current);
      startHypno();
      return;
    }

    // Hide the distress scale as soon as the user sends anything
    setShowDistressScale(false);

    // A fresh user message supersedes any pending relaxation offer
    setShowHypnoOffer(false);

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
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          firstSession: firstSessionRef.current,
          memory: memoryRef.current,
        }),
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
        // Sova offered a guided relaxation — surface the "Begin" affordance
        setShowHypnoOffer(true);
      }

      setTherapyMode(!!data.therapyMode);
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
  }, [saveSession, stopHypno, appendAssistant, startHypno]);

  const handleDistressSelect = (value) => {
    setShowDistressScale(false);
    setPrefillText(String(value));
  };

  if (!user) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <div className="app">
      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        onSend={sendMessage}
        onLogout={handleLogout}
        showDistressScale={showDistressScale}
        onDistressSelect={handleDistressSelect}
        onDistressClose={() => setShowDistressScale(false)}
        prefillText={prefillText}
        therapyMode={therapyMode}
        sessionCount={sessionCount}
        sessionGoal={SESSIONS_BEFORE_FEEDBACK}
        showHypnoOffer={showHypnoOffer}
        onStartHypno={promptGratitude}
        hypnoPlaying={hypnoPlaying}
        hypnoPaused={hypnoPaused}
        onToggleHypnoPause={toggleHypnoPause}
      />
      <CrisisOverlay
        isOpen={showCrisis}
        onClose={() => setShowCrisis(false)}
      />
      {showFeedback && (
        <FeedbackPrompt
          userId={user.id}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
