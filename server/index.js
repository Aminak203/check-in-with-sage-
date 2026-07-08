const express = require("express");
const cors = require("cors");
const { chatWithMabel } = require("./llm");
const { synthesize } = require("./tts");
const { detectCrisis, detectRatingRequest, detectTherapyMode, detectHypnoOffer } = require("./triage");
const { selectScript, listScripts } = require("./scripts");
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
    // Only offer a guided relaxation when it isn't a crisis.
    const offerHypno = !isCrisis && detectHypnoOffer(reply);

    res.json({ reply, crisis: isCrisis, requestRating: isRatingRequest, therapyMode: inTherapyMode, offerHypno });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      reply: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment. If you're in crisis, please call Samaritans on 116 123.",
      crisis: false,
    });
  }
});

// Returns the catalog (id/name/use only) — handy for debugging or a picker UI.
app.get("/api/hypno/scripts", (req, res) => {
  res.json({ scripts: listScripts() });
});

// AI-selects the best-fitting relaxation script for the user's current state and
// returns the full script (including timed steps) for the deterministic runner.
app.post("/api/hypno/select", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array is required" });
    }

    const script = await selectScript(messages);
    res.json({ script });
  } catch (error) {
    console.error("Hypno select error:", error);
    res.status(500).json({ error: "Could not select a relaxation script" });
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
