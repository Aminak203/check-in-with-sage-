const { complete } = require("./llm");

// ---------------------------------------------------------------------------
// Hypnotherapy / relaxation script catalog
// ---------------------------------------------------------------------------
// The LLM only CHOOSES which script fits the user's current state (see
// selectScript). The deterministic client-side runner then plays the chosen
// script's `steps` in order — one spoken step at a time — so delivery never
// drifts off-script.
//
// TODO(content): replace the placeholder `text` on each step with your own
// clinically-approved wording. `pauseMs` is how long the runner waits AFTER
// speaking a step before moving to the next one — tune per step.
// The `use` field is the ONLY thing the model sees when selecting, so keep it
// an accurate, plain-language description of when this script is appropriate.
// ---------------------------------------------------------------------------

const DEFAULT_PAUSE_MS = 12000;

const SCRIPTS = [
  {
    id: "progressive-muscle-relaxation",
    name: "Progressive Muscle Relaxation",
    use: "Body feels tense, wound-up, restless, or stress is held physically (tight shoulders, jaw, chest).",
    steps: [
      { text: "TODO: welcome + get comfortable + eyes closed", pauseMs: 10000 },
      { text: "TODO: tense and release the feet and calves", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: tense and release the hands and arms", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: tense and release the shoulders and neck", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: tense and release the face and jaw", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: whole-body softening + notice the difference", pauseMs: DEFAULT_PAUSE_MS },
    ],
  },
  {
    id: "four-seven-eight-breathing",
    name: "4-7-8 Breathing",
    use: "Acute stress, racing thoughts, panicky feelings, or needing to calm down quickly in the moment.",
    steps: [
      { text: "TODO: intro + posture + exhale fully to start", pauseMs: 9000 },
      { text: "TODO: round 1 — inhale 4, hold 7, exhale 8", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: round 2 — inhale 4, hold 7, exhale 8", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: round 3 — inhale 4, hold 7, exhale 8", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: round 4 — inhale 4, hold 7, exhale 8", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: return to normal breathing + notice the calm", pauseMs: 8000 },
    ],
  },
  {
    id: "safe-place-visualisation",
    name: "Safe Place Visualisation",
    use: "Anxiety, feeling unsafe or overwhelmed, wanting comfort, grounding, or a sense of security.",
    steps: [
      { text: "TODO: settle + eyes closed + a few easy breaths", pauseMs: 10000 },
      { text: "TODO: imagine a place where you feel completely safe", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: build the scene — what you see", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: add sounds, smells, temperature, textures", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: anchor the calm feeling to a word or gesture", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: gently return, knowing you can revisit anytime", pauseMs: 8000 },
    ],
  },
  {
    id: "body-scan",
    name: "Body Scan",
    use: "Difficulty sleeping, feeling disconnected or numb, or winding down at the end of the day.",
    steps: [
      { text: "TODO: lie or sit comfortably + eyes closed", pauseMs: 10000 },
      { text: "TODO: bring attention to the top of the head", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: move attention slowly down the torso", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: move attention down the legs to the feet", pauseMs: DEFAULT_PAUSE_MS },
      { text: "TODO: notice the whole body as one + rest", pauseMs: DEFAULT_PAUSE_MS },
    ],
  },
];

// Safe default if the model returns something unrecognisable or errors.
const FALLBACK_ID = "four-seven-eight-breathing";

// Lightweight list (no step content) — for a selection prompt or a catalog endpoint.
function listScripts() {
  return SCRIPTS.map(({ id, name, use }) => ({ id, name, use }));
}

function getScript(id) {
  return SCRIPTS.find((s) => s.id === id) || null;
}

// Ask the LLM to pick the single best-fitting script id for the user's current
// state. The model only returns an id; we validate it against the catalog and
// fall back to a safe default, so an off-format answer can never break playback.
async function selectScript(messages) {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const catalog = SCRIPTS.map((s) => `${s.id} — ${s.use}`).join("\n");

  const selectionMessages = [
    {
      role: "system",
      content:
        "You are a triage assistant. Choose the single most appropriate relaxation exercise for the user's current emotional and physical state, based on the conversation. Reply with ONLY the exercise id from the list — no explanation, no punctuation, no other words.",
    },
    {
      role: "user",
      content: `Conversation:\n${transcript}\n\nAvailable exercises (id — when to use):\n${catalog}\n\nReturn only the single best-matching id.`,
    },
  ];

  let raw = "";
  try {
    raw = (await complete(selectionMessages, { temperature: 0, maxTokens: 32 })) || "";
  } catch (err) {
    console.error("Script selection failed, using fallback:", err);
  }

  const normalised = raw.toLowerCase();
  const match = SCRIPTS.find((s) => normalised.includes(s.id));
  return getScript(match ? match.id : FALLBACK_ID);
}

module.exports = { SCRIPTS, listScripts, getScript, selectScript };
