const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

// Free Microsoft Edge neural text-to-speech — no API key, no Python.
// The `calm` flag slows delivery slightly for hypnotherapy/relaxation steps.
const TTS_VOICE = process.env.TTS_VOICE || "en-GB-SoniaNeural";

async function synthesize(text, { calm = false } = {}) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text, calm ? { rate: "-12%", pitch: "-2%" } : {});

  return new Promise((resolve, reject) => {
    const chunks = [];
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("end", () => {
      tts.close();
      const buffer = Buffer.concat(chunks);
      if (buffer.length === 0) {
        reject(new Error("TTS returned empty audio"));
      } else {
        resolve(buffer);
      }
    });
    audioStream.on("error", (err) => {
      tts.close();
      reject(err);
    });
  });
}

module.exports = { synthesize };
