const TTS_API = "/api/tts";

let muted = false;
let speaking = false;
let currentAudio = null;
const queue = [];
let processing = false;
let onStateChange = null;

function isTherapyText(text) {
  const therapyKeywords = [
    "breathing", "inhale", "exhale",
    "relax your", "safe place", "visualize", "visualise", "imagine a",
    "close your eyes", "hypnotherapy", "relaxation",
  ];
  const lower = text.toLowerCase();
  return therapyKeywords.some((kw) => lower.includes(kw));
}

async function fetchAudio(text, calm) {
  const res = await fetch(TTS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, calm }),
  });

  if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// Fire an item's onStart callback exactly once — used by callers to reveal the
// message text in sync with audio (or when we give up, so text never gets stuck
// hidden). Called at playback start and on every failure/skip path.
function fireStart(item) {
  if (item && typeof item.onStart === "function" && !item.started) {
    item.started = true;
    item.onStart();
  }
}

// Revoke a prefetched blob URL once its promise settles — used when we drop
// queued items (interrupt/mute) so their synthesized audio doesn't leak.
function revokeWhenReady(audioPromise) {
  if (!audioPromise) return;
  audioPromise.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
}

function setSpeaking(value) {
  if (speaking === value) return;
  speaking = value;
  if (onStateChange) onStateChange(value);
}

async function processQueue() {
  if (muted || queue.length === 0) {
    processing = false;
    setSpeaking(false);
    return;
  }

  processing = true;
  setSpeaking(true);

  const item = queue.shift();

  // Audio synthesis was kicked off when the item was enqueued (see speak), so
  // by the time it's this item's turn the fetch is usually already done — no
  // per-bubble network gap between consecutive messages. Resolves to null if
  // synthesis failed (the rejection is already handled at enqueue time).
  const audioUrl = await item.audioPromise;

  // Muted or interrupted while we were awaiting the fetch — reveal the text and
  // stop; the queue was already cleared by stopSpeaking/setMuted if interrupted.
  if (muted) {
    fireStart(item);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    processing = false;
    setSpeaking(false);
    return;
  }

  if (!audioUrl) {
    // Synthesis failed — reveal the text anyway and move to the next item.
    fireStart(item);
    processQueue();
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio.src) URL.revokeObjectURL(currentAudio.src);
  }

  currentAudio = new Audio(audioUrl);

  // Advance to the next item exactly once, whether playback ended, errored, or
  // failed to start — prevents double-advancing the queue.
  let advanced = false;
  const advance = () => {
    if (advanced) return;
    advanced = true;
    URL.revokeObjectURL(audioUrl);
    currentAudio = null;
    setTimeout(() => processQueue(), 200);
  };

  currentAudio.onended = advance;
  currentAudio.onerror = () => {
    fireStart(item); // reveal text even if playback errors
    advance();
  };

  // Reveal the text right as the audio starts, keeping voice and words in sync.
  fireStart(item);
  try {
    await currentAudio.play();
  } catch (err) {
    // Autoplay blocked or playback rejected — text is already revealed; move on.
    advance();
  }
}

export function setMuted(value) {
  muted = value;
  if (value) {
    stopSpeaking();
  }
}

export function isMuted() {
  return muted;
}

export function isSpeaking() {
  return speaking;
}

export function speak(text, options = {}) {
  if (!text || !text.trim()) return;

  // Muted — no audio to play; reveal any held text immediately so it can't get
  // stuck behind a typing bubble waiting for a start that never comes.
  if (muted) {
    if (typeof options.onStart === "function") options.onStart();
    return;
  }

  const calm = options.calm || isTherapyText(text);
  const item = { text, calm, onStart: options.onStart, started: false };
  // Start synthesizing now, not when it reaches the front of the queue, so audio
  // for later bubbles in the same response is ready the moment it's their turn.
  // Handle rejection here (resolve to null) so an item that fails while still
  // queued never surfaces as an unhandled promise rejection.
  item.audioPromise = fetchAudio(text, calm).catch((err) => {
    console.error("TTS fetch error:", err);
    return null;
  });

  queue.push(item);

  if (!processing) {
    processQueue();
  }
}

export function stopSpeaking() {
  // Drop queued items and revoke their prefetched audio so nothing leaks.
  queue.forEach((item) => revokeWhenReady(item.audioPromise));
  queue.length = 0;
  processing = false;
  if (currentAudio) {
    currentAudio.pause();
    if (currentAudio.src) URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  setSpeaking(false);
}

export function setOnStateChange(callback) {
  onStateChange = callback;
}
