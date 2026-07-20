const fs = require("fs");
const path = require("path");
const { complete, embed } = require("./llm");
const LONG_SCRIPTS = require("./scripts.data.json");

// ---------------------------------------------------------------------------
// Hypnotherapy / relaxation script catalog
// ---------------------------------------------------------------------------
// The LLM only CHOOSES which script fits the user's current state (see
// selectScript). The deterministic client-side runner then plays the chosen
// script's `steps` in order — one spoken step at a time — so delivery never
// drifts off-script.
//
// The catalog has two tiers:
//   1. QUICK_SCRIPTS (below) — short, practical in-the-moment techniques.
//   2. scripts.data.json — full session-length (~10-16 min) hypnotherapy
//      scripts generated from the clinical Word documents in
//      "hypnotherapy scripts docs/" (see server/scripts/build-scripts.js to
//      regenerate scripts.data.json after editing the source docs).
//
// `pauseMs` is how long the runner waits AFTER a step's text appears before
// moving on. Because the runner does NOT wait for the audio to finish, each
// pause already budgets for speaking time + a short silence.
// The `use` field is the ONLY thing the model sees when selecting, so keep it
// an accurate, plain-language description of when this script is appropriate.
// ---------------------------------------------------------------------------

const QUICK_SCRIPTS = [
  {
    id: "progressive-muscle-relaxation",
    name: "Progressive Muscle Relaxation",
    use: "Body feels tense, wound-up, restless, or stress is held physically (tight shoulders, jaw, chest).",
    steps: [
      {
        text: "Let's begin. Find a comfortable position, sitting or lying down, and when you're ready, gently allow your eyes to close. Take a slow, easy breath in through your nose... and let it go, slowly, through your mouth. There's nothing you need to do right now except notice your breath and let your body begin to settle.",
        pauseMs: 14000,
      },
      {
        text: "Bring your attention down to your feet and calves. As you breathe in, curl your toes and tighten the muscles in your feet and lower legs... hold that tension... and now, as you breathe out, let it all go completely. Feel the difference — the warmth, the heaviness, the release spreading through your feet and calves.",
        pauseMs: 16000,
      },
      {
        text: "Now move up to your hands and arms. Slowly clench your fists and tighten your arms, drawing the tension up toward your shoulders... hold it for a moment... and release, letting your hands fall soft and open. Notice your arms growing heavier, looser, more at rest with every breath.",
        pauseMs: 16000,
      },
      {
        text: "Bring your awareness to your shoulders and neck — a place we often carry so much. Gently lift your shoulders up toward your ears and hold that tightness... and now let them drop, all the way down. Feel the tension draining away from your neck and shoulders, softening, melting, letting go.",
        pauseMs: 16000,
      },
      {
        text: "Now the muscles of your face and jaw. Scrunch up your face — your forehead, your eyes, your jaw — hold it gently... and release, letting everything smooth out. Let your jaw hang loose, your forehead grow smooth, the space between your eyebrows soften completely.",
        pauseMs: 16000,
      },
      {
        text: "And now let your whole body soften as one. From the top of your head to the tips of your toes, everything is loose, heavy, and calm. Take a moment to notice how different your body feels now — how much lighter, how much more at ease. Rest here, knowing you can return to this calm whenever you need it.",
        pauseMs: 15000,
      },
    ],
  },
  {
    id: "four-seven-eight-breathing",
    name: "4-7-8 Breathing",
    use: "Acute stress, racing thoughts, panicky feelings, or needing to calm down quickly in the moment.",
    steps: [
      {
        text: "Let's slow things down together with a simple breathing rhythm. Sit comfortably with your back supported, and rest the tip of your tongue lightly behind your front teeth. To begin, empty your lungs completely — breathe all the way out through your mouth with a soft whooshing sound. Good. Now we'll breathe in a gentle pattern: in for four, hold for seven, out for eight.",
        pauseMs: 12000,
      },
      {
        text: "Here's the first round. Breathe in quietly through your nose... two... three... four. Now hold it gently... two... three... four... five... six... seven. And release slowly through your mouth... two... three... four... five... six... seven... eight. Well done.",
        pauseMs: 20000,
      },
      {
        text: "Second round. Breathe in through your nose... two... three... four. Hold... two... three... four... five... six... seven. And out, slow and steady... two... three... four... five... six... seven... eight. Notice your body beginning to settle.",
        pauseMs: 20000,
      },
      {
        text: "Third round. Gently in... two... three... four. Hold the breath... two... three... four... five... six... seven. And let it flow out... two... three... four... five... six... seven... eight. A little calmer with each breath.",
        pauseMs: 20000,
      },
      {
        text: "Last round. In through your nose... two... three... four. Hold... two... three... four... five... six... seven. And release everything... two... three... four... five... six... seven... eight. Beautiful.",
        pauseMs: 20000,
      },
      {
        text: "Now let your breathing return to its own natural rhythm. There's no need to control it anymore. Just notice how your body feels — a little slower, a little softer, a little more settled than when we began. Carry this calm with you.",
        pauseMs: 10000,
      },
    ],
  },
  {
    id: "safe-place-visualisation",
    name: "Safe Place Visualisation",
    use: "Anxiety, feeling unsafe or overwhelmed, wanting comfort, grounding, or a sense of security.",
    steps: [
      {
        text: "Let's create a place of calm together. Settle into a comfortable position and gently let your eyes close. Take a few slow, easy breaths — in through your nose, and softly out through your mouth. With each breath out, allow your body to sink a little deeper into the surface beneath you, letting the world outside fade gently into the background.",
        pauseMs: 14000,
      },
      {
        text: "Now, in your mind, begin to picture a place where you feel completely safe and at peace. It might be somewhere real that you know and love, or somewhere entirely imagined. There's no right or wrong — simply let a place come to mind, a place that feels like it's just for you.",
        pauseMs: 15000,
      },
      {
        text: "Look around this place and begin to build it in your mind. What do you see? Notice the colours, the light, the shapes around you. Perhaps there's water, or trees, or a warm room. Take your time to fill in the details, letting the scene grow clearer and more real with every moment.",
        pauseMs: 16000,
      },
      {
        text: "Now let your other senses join in. What can you hear in this place — gentle sounds, or peaceful quiet? What can you smell? Notice the temperature on your skin, the air around you, the textures beneath you. Let yourself be fully here, safe and held in this place you've created.",
        pauseMs: 16000,
      },
      {
        text: "Notice the feeling of calm and safety in your body right now. Let's anchor it, so you can return to it whenever you wish. Choose a simple word — like 'calm' or 'safe' — or press your thumb and finger gently together. As you do, let that word or gesture hold this peaceful feeling, saving it for whenever you need it.",
        pauseMs: 15000,
      },
      {
        text: "In a moment we'll gently return. Know that this safe place is always here, and you can come back any time simply by closing your eyes and breathing. Take one more slow breath... and when you're ready, let your awareness drift back to the room, bringing that sense of calm with you.",
        pauseMs: 10000,
      },
    ],
  },
  {
    id: "body-scan",
    name: "Body Scan",
    use: "Difficulty sleeping, feeling disconnected or numb, or winding down at the end of the day.",
    steps: [
      {
        text: "Let's take some time to reconnect with your body and let it rest. Lie down or sit somewhere comfortable, and gently allow your eyes to close. Take a few slow breaths, and with each exhale, let yourself become a little heavier, a little more still. There's nowhere to be and nothing to do — just this quiet time for you.",
        pauseMs: 13000,
      },
      {
        text: "Bring your attention gently to the very top of your head. Simply notice any sensations there — warmth, tingling, or perhaps nothing at all, and that's fine too. Let your awareness soften the muscles of your scalp and forehead, releasing any tightness around your eyes and temples as you breathe slowly.",
        pauseMs: 16000,
      },
      {
        text: "Now let your attention drift slowly down through your neck and shoulders, into your chest and back, and down through your stomach. Notice each part as you pass through it, without judging, without changing anything — just noticing, and letting each area soften and grow heavy with rest.",
        pauseMs: 17000,
      },
      {
        text: "Continue moving your awareness down through your hips, along your legs, past your knees, and all the way down to your feet and toes. Let the lower half of your body grow warm and heavy, sinking gently into the surface beneath you, completely supported and at ease.",
        pauseMs: 16000,
      },
      {
        text: "Now let go of any single point of focus and simply feel your whole body at once — resting, breathing, at peace. Notice how calm and connected you feel. Stay here as long as you like, letting yourself drift, knowing your body is safe, settled, and ready to rest.",
        pauseMs: 15000,
      },
    ],
  },
];

// Full catalog: quick in-the-moment techniques first, then the long
// session-length hypnotherapy scripts loaded from scripts.data.json. Each script
// is tagged with a `tier`: "quick" (short breathing/grounding techniques) or
// "session" (full-length guided hypnotherapy — the actual product).
const SCRIPTS = [
  ...QUICK_SCRIPTS.map((s) => ({ ...s, tier: "quick" })),
  ...LONG_SCRIPTS.map((s) => ({ ...s, tier: "session" })),
];

// When the app offers a "guided hypnotherapy session" and the user accepts, the
// trance IS the product — so selection draws from the full-length session
// scripts, not the quick techniques. The quick scripts' short, distress-keyword
// descriptions otherwise dominate semantic retrieval and the LLM keeps landing
// on breathing/body-scan instead of a real hypnotherapy script. Quick scripts
// stay in the catalog (getScript/listScripts) for any explicit use.
const SESSION_SCRIPTS = SCRIPTS.filter((s) => s.tier === "session");
// The quick-tier pool — short breathing/grounding techniques used ONLY when the
// person needs an immediate in-the-moment reset (see isAcute / selectScript).
const QUICK_POOL = SCRIPTS.filter((s) => s.tier === "quick");

// Safe defaults if the model returns something unrecognisable or errors — a
// broadly-applicable script for each tier.
const FALLBACK_ID = "anxiety-relief"; // full session
const QUICK_FALLBACK_ID = "four-seven-eight-breathing"; // immediate reset

// Lightweight list (no step content) — for a selection prompt or a catalog endpoint.
function listScripts() {
  return SCRIPTS.map(({ id, name, use }) => ({ id, name, use }));
}

function getScript(id) {
  return SCRIPTS.find((s) => s.id === id) || null;
}

// ---------------------------------------------------------------------------
// Retrieval (RAG) — precomputed script embeddings
// ---------------------------------------------------------------------------
// Vectors are built offline by server/scripts/build-embeddings.js. We load them
// once at startup. If the file is missing (never built) or stale (catalog
// changed since it was built), retrieval is disabled and selectScript falls
// back to handing the LLM the full catalog — i.e. exactly the old behaviour.
// ---------------------------------------------------------------------------
const EMBEDDINGS_PATH = path.join(__dirname, "scripts.embeddings.json");

let SCRIPT_VECTORS = null; // { id: number[] } or null when unavailable
(function loadEmbeddings() {
  try {
    const raw = fs.readFileSync(EMBEDDINGS_PATH, "utf8");
    const data = JSON.parse(raw);
    const haveAll = SCRIPTS.every((s) => Array.isArray(data.vectors?.[s.id]));
    if (!haveAll) {
      console.warn(
        "Script embeddings are stale (catalog changed) — run `node server/scripts/build-embeddings.js`. Falling back to full-catalog selection."
      );
      return;
    }
    SCRIPT_VECTORS = data.vectors;
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("Could not load script embeddings:", err.message);
    // ENOENT (not built yet) is expected before first build — stay silent-ish.
  }
})();

// Cosine similarity between two equal-length vectors (higher = more similar).
function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Rank scripts in `pool` by semantic closeness to `queryVector`, most similar
// first. Defaults to the full catalog; guided-session selection passes the
// session-tier pool so quick techniques don't crowd out the trance scripts.
function rankBySimilarity(queryVector, pool = SCRIPTS) {
  return pool
    .map((s) => ({ script: s, score: cosineSimilarity(queryVector, SCRIPT_VECTORS[s.id]) }))
    .sort((a, b) => b.score - a.score);
}

// How many top candidates we retrieve before the LLM makes the final call.
const RETRIEVE_K = 5;

// The conversation text we embed as the retrieval query. The most recent turns
// carry the current state, so we use the tail of the transcript rather than the
// whole history (also keeps us well inside the embedding token limit).
function queryText(messages) {
  return messages
    .filter((m) => m.role !== "system")
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
}

// Decide whether the person needs an IMMEDIATE in-the-moment reset (a quick
// breathing/grounding technique) rather than a full-length guided session.
// Deliberately conservative — a full session is the default product, so we only
// return true for clear acute distress happening right now. Any failure (or an
// off-format answer, common with reasoning models that spend the whole budget
// thinking) defaults to false → a full session.
async function isAcute(messages) {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const classifyMessages = [
    {
      role: "system",
      content:
        "You triage what kind of relaxation someone needs RIGHT NOW. Answer with ONLY one word: ACUTE or SESSION. Answer ACUTE only when the person appears to be in acute distress in this moment and needs to calm down immediately — e.g. a panic attack, hyperventilating, can't catch their breath, heart racing, feeling out of control right now. For general stress, low mood, anxiety, poor sleep, overthinking, or winding down, answer SESSION.",
    },
    { role: "user", content: `Conversation:\n${transcript}\n\nAnswer ACUTE or SESSION.` },
  ];

  try {
    const raw = (await complete(classifyMessages, { maxTokens: 2000 })) || "";
    return /\bacute\b/i.test(raw);
  } catch (err) {
    console.error("Acute triage failed, defaulting to a full session:", err.message);
    return false;
  }
}

// Ask the LLM to pick the single best-fitting script id for the user's current
// state. First we decide the tier: a quick in-the-moment technique for acute
// distress, otherwise a full-length hypnotherapy session (the default product).
// Within that tier, with embeddings available we RETRIEVE the top-K closest
// scripts and ask the model to choose among those; otherwise we offer the whole
// tier. Either way the model returns just an id, which we validate against the
// candidates and back off to a safe default — so an off-format answer (or any
// failure) can never break playback.
async function selectScript(messages) {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  // Run the tier triage and the retrieval embedding together — the query vector
  // is tier-independent (it embeds the conversation, not the pool), so there's no
  // need to wait for one before starting the other.
  const [acute, queryVector] = await Promise.all([
    isAcute(messages),
    SCRIPT_VECTORS
      ? embed(queryText(messages)).catch((err) => {
          console.error("Embedding query failed, offering the whole tier:", err.message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const pool = acute ? QUICK_POOL : SESSION_SCRIPTS;
  const fallbackId = acute ? QUICK_FALLBACK_ID : FALLBACK_ID;

  // --- Retrieval: narrow to the K most relevant scripts within the tier -------
  let candidates = pool;
  let topByScore = null;
  if (queryVector) {
    const ranked = rankBySimilarity(queryVector, pool);
    topByScore = ranked[0].script; // best purely-semantic match (fallback)
    candidates = ranked.slice(0, RETRIEVE_K).map((r) => r.script);
  }

  const catalog = candidates.map((s) => `${s.id} — ${s.use}`).join("\n");

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
    raw = (await complete(selectionMessages, { maxTokens: 4000 })) || "";
  } catch (err) {
    console.error("Script selection failed, using fallback:", err);
  }

  // Match against the candidates the model actually saw. If it answers
  // off-format, prefer the top retrieved script (best semantic match) over the
  // blunt tier default; only fall back to fallbackId when we have nothing.
  const normalised = raw.toLowerCase();
  const match = candidates.find((s) => normalised.includes(s.id));
  if (match) return getScript(match.id);
  if (topByScore) return getScript(topByScore.id);
  return getScript(fallbackId);
}

module.exports = { SCRIPTS, listScripts, getScript, selectScript };
