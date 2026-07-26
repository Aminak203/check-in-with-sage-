import { useState, useEffect, useRef, useCallback } from "react";
import ChatWindow from "./components/ChatWindow";
import CrisisOverlay from "./components/CrisisOverlay";
import AuthScreen from "./components/AuthScreen";
import FeedbackPrompt from "./components/FeedbackPrompt";
import { signOut, startSession, saveTranscript, getProfile, getPastSessions, saveSummary } from "./utils/supabase";
import { prefetch, setOnItemEnd, pausePlayback, resumePlayback, isMuted, isSpeaking } from "./utils/tts";

const GREETING = {
  role: "assistant",
  content:
    "Hello, I'm Sorra. I'm here to listen and help you through whatever you're going through. What's been on your mind lately?",
  isGreeting: true,
};

const AUTO_LOCK_MS = 10 * 60 * 1000;
const SESSIONS_BEFORE_FEEDBACK = 5;

// Silence held between relaxation steps, measured from when a step finishes
// speaking to when the next one is delivered — a short, contemplative gap.
const HYPNO_SILENCE_MS = 2800;
// When muted (no audio to pace off), fall back to an estimated reading time so
// the steps don't race past. ~2.6 words/sec plus a small buffer.
const readingMs = (text) =>
  Math.max(4000, (text.trim().match(/\S+/g) || []).length * 380 + 1500);

// Asked once, just before every guided relaxation, to gently prime a positive
// focus before the trance begins (Owen's steer).
const GRATITUDE_QUESTION =
  "Before we begin, let's gently shift your focus. Take a moment — what are three things you feel grateful for right now, however small?";
const GRATITUDE_ACK =
  "Thank you for sharing those — holding them in mind is a lovely way to begin.";

// Rough yes/no read of a short reply to Sorra's "would you like a relaxation
// now?" invite. Negatives are checked first so "no thanks" / "not now" win over
// a stray affirmative word. Returns "yes" | "no" | "unknown" (unknown → the
// reply is treated as normal conversation, not a confirmation).
const AFFIRM_RE = /\b(yes|yeah|yep|yup|sure|ok|okay|okey|alright|please|go on|let'?s|i do|i would|sounds good|definitely|absolutely|go for it|why not|i'?m ready)\b/i;
const NEGATE_RE = /\b(no|nope|nah|not now|not right now|maybe later|later|not really|no thanks|not today|i'?m good|i'?m okay|pass|don'?t|do not)\b/i;
function classifyYesNo(text) {
  if (NEGATE_RE.test(text)) return "no";
  if (AFFIRM_RE.test(text)) return "yes";
  return "unknown";
}

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
  const hypnoPausedRef = useRef(false);
  const deliveredStepRef = useRef(-1);
  // Text of the step currently being spoken — the audio "finished" signal is
  // matched against this so we only advance when THIS step has been fully voiced.
  const currentStepTextRef = useRef(null);
  const sessionIdRef = useRef(null);
  // True only on the user's very first ever session — the server uses this to
  // add a brief nervous-system / gratitude explainer to Sorra's first check-in.
  const firstSessionRef = useRef(false);
  // Between tapping "Begin" and the trance starting, we ask the client to name a
  // few things they're grateful for (Owen's steer: prime that part of the brain
  // before the relaxation). While true, the next typed message is that answer.
  const awaitingGratitudeRef = useRef(false);
  // Gratitude priming runs only on the user's first-ever session — after that we
  // go straight into the trance, so it isn't repeated before every relaxation.
  const gratitudeDoneRef = useRef(false);
  // After Sorra asks "would you like a relaxation now?", the next reply is the
  // yes/no answer — only on "yes" do we reveal the Begin button (see sendMessage).
  const awaitingHypnoConfirmRef = useRef(false);
  // Once the user has declined a relaxation, we stop auto-surfacing the offer /
  // Begin button on later replies (otherwise Sorra re-offers every turn and it
  // loops). Cleared only when the user affirmatively asks for one themselves.
  const hypnoDeclinedRef = useRef(false);
  // Short recaps of this user's recent past sessions, sent to the server so Sorra
  // can gently recall them ("last time you mentioned…"). Built once on login.
  const memoryRef = useRef([]);

  // Ensure a past-session row has a recap, generating + persisting one if it's
  // missing. Mutates s.summary so callers can reuse it. Returns "" when there's
  // nothing meaningful to record (or on error).
  const ensureSummary = useCallback(async (s) => {
    if (s.summary && s.summary.trim()) return s.summary.trim();
    if (!Array.isArray(s.transcript) || !s.transcript.some((m) => m.role === "user")) return "";
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: s.transcript }),
      });
      const data = await res.json();
      const summary = (data.summary || "").trim();
      if (summary) {
        s.summary = summary;
        await saveSummary(s.id, summary);
      }
      return summary;
    } catch (e) {
      console.error("Failed to summarize a past session:", e);
      return "";
    }
  }, []);

  // Assemble the cross-session memory: summarize the recent past sessions that
  // still lack a recap and keep the latest couple to send to Sorra for in-chat
  // recall. Runs in the background — if it's not ready by the first message,
  // that message simply goes out without recall. Never blocks the UI. Accepts an
  // already-fetched session list to avoid refetching. Returns the recall array.
  const buildMemory = useCallback(async (userId, currentSessionId, preloaded) => {
    try {
      const past = preloaded || (await getPastSessions(userId, currentSessionId, 5));
      const withContent = past.filter(
        (s) => Array.isArray(s.transcript) && s.transcript.some((m) => m.role === "user")
      );
      // Summarize at most the 3 most recent that still lack a recap (bounds cost).
      for (const s of withContent.slice(0, 3)) await ensureSummary(s);
      // Recall the two most recent non-empty summaries.
      memoryRef.current = withContent
        .map((s) => s.summary)
        .filter((x) => x && x.trim())
        .slice(0, 2);
      return memoryRef.current;
    } catch (e) {
      console.error("Failed to build session memory:", e);
      return [];
    }
  }, [ensureSummary]);

  const handleLogout = useCallback(async () => {
    const apiMessages = messagesRef.current.filter((m) => !m.isGreeting);
    if (apiMessages.length) await saveTranscript(sessionIdRef.current, apiMessages);
    await signOut();
    sessionIdRef.current = null;
    memoryRef.current = [];
    awaitingGratitudeRef.current = false;
    gratitudeDoneRef.current = false;
    awaitingHypnoConfirmRef.current = false;
    hypnoDeclinedRef.current = false;
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

  // Reset the inactivity auto-lock on any activity. New messages — whether the
  // user's, Sorra's, or each relaxation step — count as activity, so a session
  // never gets kicked to the login screen mid-conversation or mid-relaxation.
  // It only locks after a genuinely idle stretch (AUTO_LOCK_MS with no messages).
  useEffect(() => {
    if (user) resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, messages, resetTimer]);

  // Also count real interaction as activity, not just sent messages. Reading a
  // reply, composing a long message, scrolling, or sitting with a relaxation all
  // keep the session alive — so it only locks when the person has genuinely
  // stepped away (no messages AND no interaction for AUTO_LOCK_MS).
  useEffect(() => {
    if (!user) return;
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"];
    const onActivity = () => resetTimer();
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onActivity));
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

  // Open the check-in with a fresh, personal greeting (name + last-visit recap)
  // instead of a fixed line. Set as the first message so ChatWindow voices it
  // exactly once; falls back to the static GREETING if generation fails.
  const openWithGreeting = useCallback(async ({ name, lastSummary, firstSession }) => {
    try {
      const res = await fetch("/api/greeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lastSummary, firstSession }),
      });
      const data = await res.json();
      const greeting = (data.greeting || "").trim();
      setMessages([
        greeting
          ? { role: "assistant", content: greeting, isGreeting: true }
          : GREETING,
      ]);
    } catch (e) {
      console.error("Failed to generate opening greeting:", e);
      setMessages([GREETING]);
    }
  }, []);

  // Called once on successful login/signup: opens a new session row (a login =
  // one session) and, once they hit the milestone, surfaces the feedback form.
  const handleAuth = useCallback(async (authUser) => {
    setUser(authUser);
    // Hold the chat behind a typing bubble until the personal opening is ready,
    // so the greeting is composed (and voiced) once, not swapped in after a
    // static line has already been spoken.
    setMessages([]);
    setIsLoading(true);
    try {
      const { session, sessionCount } = await startSession(authUser.id);
      sessionIdRef.current = session.id;
      // sessionCount includes the row we just inserted, so 1 = first ever visit.
      firstSessionRef.current = sessionCount === 1;
      gratitudeDoneRef.current = false;
      setSessionCount(sessionCount);

      const profile = await getProfile(authUser.id);
      if (sessionCount >= SESSIONS_BEFORE_FEEDBACK && !profile?.feedback_submitted) {
        setShowFeedback(true);
      }

      // On a return visit, grab the most recent past session's recap for the
      // greeting (summarizing just that one if needed — fast), then fill the
      // full cross-session recall in the background for in-chat use.
      let lastSummary = "";
      if (sessionCount > 1) {
        try {
          const past = await getPastSessions(authUser.id, session.id, 5);
          const latest = past.find(
            (s) => Array.isArray(s.transcript) && s.transcript.some((m) => m.role === "user")
          );
          if (latest) {
            lastSummary = await ensureSummary(latest);
            if (lastSummary) memoryRef.current = [lastSummary];
          }
          buildMemory(authUser.id, session.id, past);
        } catch (e) {
          console.error("Failed to prepare session memory:", e);
        }
      }

      await openWithGreeting({
        name: profile?.name || authUser.user_metadata?.name || "",
        lastSummary,
        firstSession: firstSessionRef.current,
      });
    } catch (e) {
      console.error("Failed to start session:", e);
      setMessages([GREETING]);
    } finally {
      setIsLoading(false);
    }
  }, [buildMemory, ensureSummary, openWithGreeting]);

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
    hypnoPausedRef.current = false;
    deliveredStepRef.current = -1;
    currentStepTextRef.current = null;
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
    gratitudeDoneRef.current = true; // prime gratitude once, on the first session
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
      // Warm the opening step while the "let's begin" line plays, so the trance
      // starts smoothly rather than with an audible synthesis stall.
      if (script.steps[0]) prefetch(script.steps[0].text, { calm: true });
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

  // Tapping "Begin": on the user's first-ever session we prime gratitude first
  // (Owen's steer), then start; on every later session we go straight into the
  // trance so gratitude isn't repeated before each relaxation.
  const beginRelaxation = useCallback(() => {
    if (firstSessionRef.current && !gratitudeDoneRef.current) {
      promptGratitude();
    } else {
      setShowHypnoOffer(false);
      startHypno();
    }
  }, [promptGratitude, startHypno]);

  const toggleHypnoPause = () => {
    if (!hypnoPlayingRef.current) return;
    const next = !hypnoPausedRef.current;
    hypnoPausedRef.current = next;
    setHypnoPaused(next);
    if (next) {
      // Pausing: hold the voice and cancel any pending step advance.
      pausePlayback();
      if (hypnoTimerRef.current) {
        clearTimeout(hypnoTimerRef.current);
        hypnoTimerRef.current = null;
      }
    } else if (isSpeaking()) {
      // Resuming mid-sentence: let the current step's audio play on; it will
      // fire its own "finished" signal, which advances us.
      resumePlayback();
    } else {
      // Resuming between steps (audio already finished): move on shortly.
      hypnoTimerRef.current = setTimeout(() => setHypnoStep((s) => s + 1), HYPNO_SILENCE_MS);
    }
  };

  // Advancement is driven by real speech completion (not a fixed timer): when a
  // step's audio finishes, we wait a short silence and move to the next. This is
  // what guarantees the next step's text is never on screen while the current
  // one is still being spoken — it isn't even delivered until now.
  useEffect(() => {
    setOnItemEnd((text) => {
      if (!hypnoPlayingRef.current || hypnoPausedRef.current) return;
      if (text !== currentStepTextRef.current) return; // ignore non-step lines
      if (hypnoTimerRef.current) clearTimeout(hypnoTimerRef.current);
      const delay = isMuted() ? readingMs(text) : HYPNO_SILENCE_MS;
      hypnoTimerRef.current = setTimeout(() => setHypnoStep((s) => s + 1), delay);
    });
    return () => setOnItemEnd(null);
  }, []);

  // Deliver the current step (spoken via ChatWindow's auto-speak) and warm the
  // next step's audio. Delivery only happens once we've advanced to this step,
  // so a step's text appears exactly when its turn to be spoken comes.
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
      currentStepTextRef.current = steps[hypnoStep].text;
      appendAssistant(steps[hypnoStep].text);
      deliveredStepRef.current = hypnoStep;
      // Warm the next step's audio while this one plays, so it starts instantly.
      const next = steps[hypnoStep + 1];
      if (next) prefetch(next.text, { calm: true });
    }
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

    // If Sorra just asked "would you like a relaxation now?", read this reply as
    // the yes/no answer. On "yes" reveal the Begin button; on "no" accept warmly.
    // An ambiguous reply falls through and is handled as a normal message.
    if (awaitingHypnoConfirmRef.current) {
      const answer = classifyYesNo(text);
      if (answer !== "unknown") {
        awaitingHypnoConfirmRef.current = false;
        const userMsg = { role: "user", content: text };
        const updated = [...messagesRef.current, userMsg];
        setMessages(updated);
        messagesRef.current = updated;
        if (answer === "yes") {
          hypnoDeclinedRef.current = false;
          appendAssistant("Whenever you're ready, tap the Begin button below and we'll start.");
          setShowHypnoOffer(true);
        } else {
          hypnoDeclinedRef.current = true;
          setShowHypnoOffer(false);
          appendAssistant("That's completely okay, no pressure at all. I'm right here whenever you'd like to.");
        }
        await saveSession(messagesRef.current);
        return;
      }
      awaitingHypnoConfirmRef.current = false; // ambiguous — treat as normal chat
    }

    // If the user themselves brings up wanting a relaxation after declining
    // earlier, lift the suppression so Sorra can offer it again.
    if (hypnoDeclinedRef.current && /\b(relax|breath|calm|unwind|hypno|session|meditat)/i.test(text)) {
      hypnoDeclinedRef.current = false;
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
      } else if (data.offerHypno && !data.crisis && !hypnoDeclinedRef.current) {
        // Sorra asked whether they'd like a relaxation — wait for their yes/no
        // before revealing the Begin button, rather than surfacing it now.
        // Skipped once the user has already declined, so we don't loop the offer.
        awaitingHypnoConfirmRef.current = true;
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
        onStartHypno={beginRelaxation}
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
