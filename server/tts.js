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
// drop to "tts-1" via env for lower cost. "fable" is a warm, British-leaning
// voice that suits the relaxation work. Both overridable without code changes.
const TTS_MODEL = process.env.OPENAI_TTS_MODEL || "tts-1-hd";
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || "fable";

// The `calm` flag (hypnotherapy/relaxation steps) delivers a touch slower and
// more settling; normal chat speaks at the natural pace.
async function synthesize(text, { calm = false } = {}) {
  const response = await openai.audio.speech.create({
    model: TTS_MODEL,
    voice: TTS_VOICE,
    input: text,
    speed: calm ? 0.9 : 1.0,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error("TTS returned empty audio");
  return buffer;
}

module.exports = { synthesize };
