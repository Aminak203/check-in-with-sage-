const OpenAI = require("openai");
require("dotenv").config();

// Text-to-speech via OpenAI's hosted speech API — one provider (same key as the
// chat model), fast, and far lower-latency than self-hosting, which is what kept
// causing the gaps between spoken bubbles.
//
// Swappable behind this single module: to go back to free self-hosted Edge TTS,
// only this file changes — the `/api/tts` route and the client stay identical.
const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

// tts-1-hd = higher-fidelity voice (worth it for a calming hypnotherapy tone);
// drop to "tts-1" via env for lower cost. "shimmer" is a soft, calm female
// voice that suits the relaxation work. Both overridable without code changes.
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1-hd";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "shimmer";

// Speak at a natural pace. (Testers found the slowed "calm" delivery too slow;
// the `calm` flag is kept for future tuning but no longer drags the tempo.)
// Tweak TTS_CALM_SPEED / TTS_SPEED via env if you want to nudge it.
const CALM_SPEED = Number(process.env.TTS_CALM_SPEED) || 1.0;
const NORMAL_SPEED = Number(process.env.TTS_SPEED) || 1.0;

async function synthesize(text, { calm = false } = {}) {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    speed: calm ? CALM_SPEED : NORMAL_SPEED,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("TTS returned empty audio");
  return buffer;
}

module.exports = { synthesize };
