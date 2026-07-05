const express = require("express");
const cors = require("cors");
const { chatWithMabel } = require("./llm");
const { synthesize } = require("./tts");
const { detectCrisis, detectRatingRequest, detectTherapyMode } = require("./triage");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const userMessage = messages[messages.length - 1]?.content || "";
    const isCrisis = detectCrisis(userMessage);

    const reply = await chatWithMabel(messages);

    const isRatingRequest = detectRatingRequest(reply);
    const inTherapyMode = detectTherapyMode(reply);

    res.json({ reply, crisis: isCrisis, requestRating: isRatingRequest, therapyMode: inTherapyMode });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      reply: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment. If you're in crisis, please call Samaritans on 116 123.",
      crisis: false,
    });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, calm } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text string is required" });
    }

    const audioBuffer = await synthesize(text, { calm: calm || false });
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("TTS error:", error);
    res.status(503).json({ error: "TTS service unavailable" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Mabel server running on http://localhost:${PORT}`);
});
