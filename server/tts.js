const http = require("http");

const TTS_HOST = process.env.TTS_HOST || "127.0.0.1";
const TTS_PORT = parseInt(process.env.TTS_PORT, 10) || 8765;
const TTS_VOICE = process.env.TTS_VOICE || "en-GB-SoniaNeural";

function synthesize(text, { calm = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ text, voice: TTS_VOICE, calm });

    const req = http.request(
      {
        hostname: TTS_HOST,
        port: TTS_PORT,
        path: "/tts",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode === 200 && res.headers["content-type"]?.includes("audio")) {
            resolve(Buffer.concat(chunks));
          } else {
            const body = Buffer.concat(chunks).toString();
            reject(new Error(`TTS error ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("TTS request timed out"));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { synthesize };
