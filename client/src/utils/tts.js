const TTS_API = "/api/tts";

let muted = false;
let speaking = false;
let currentAudio = null;
const queue = [];
let processing = false;
let onStateChange = null;

function isTherapyText(text) {
  const therapyKeywords = [
    "tap", "tapping", "eft", "karate chop", "collarbone",
    "top of head", "breathing", "inhale", "exhale",
    "relax your", "safe place", "visualize", "imagine a",
    "close your eyes", "hypnotherapy", "reminder phrase",
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

async function processQueue() {
  if (processing || muted || queue.length === 0) {
    processing = false;
    speaking = false;
    if (onStateChange) onStateChange(speaking);
    return;
  }

  processing = true;
  const item = queue.shift();

  try {
    if (onStateChange) onStateChange(true);
    speaking = true;

    const audioUrl = await fetchAudio(item.text, item.calm);

    if (!muted && queue.length === 0 || processing) {
      if (currentAudio) {
        currentAudio.pause();
        URL.revokeObjectURL(currentAudio.src);
      }

      currentAudio = new Audio(audioUrl);
      currentAudio.onended = () => {
        URL.revokeObjectURL(currentAudio.src);
        currentAudio = null;
        setTimeout(() => processQueue(), 200);
      };
      currentAudio.onerror = () => {
        URL.revokeObjectURL(currentAudio.src);
        currentAudio = null;
        processing = false;
        processQueue();
      };

      await currentAudio.play();
    } else {
      URL.revokeObjectURL(audioUrl);
      processing = false;
      processQueue();
    }
  } catch (err) {
    console.error("TTS fetch error:", err);
    processing = false;
    processQueue();
  }
}

export function setMuted(value) {
  muted = value;
  if (value && currentAudio) {
    currentAudio.pause();
    currentAudio = null;
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

  queue.push({ text, calm: options.calm || isTherapyText(text) });

  if (!processing) {
    processQueue();
  }
}

export function stopSpeaking() {
  queue.length = 0;
  processing = false;
  if (currentAudio) {
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  speaking = false;
  if (onStateChange) onStateChange(false);
}

export function setOnStateChange(callback) {
  onStateChange = callback;
}