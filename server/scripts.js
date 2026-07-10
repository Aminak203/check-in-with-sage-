const { complete } = require("./llm");
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
// session-length hypnotherapy scripts loaded from scripts.data.json.
const SCRIPTS = [...QUICK_SCRIPTS, ...LONG_SCRIPTS];

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
    raw = (await complete(selectionMessages, { maxTokens: 4000 })) || "";
  } catch (err) {
    console.error("Script selection failed, using fallback:", err);
  }

  const normalised = raw.toLowerCase();
  const match = SCRIPTS.find((s) => normalised.includes(s.id));
  return getScript(match ? match.id : FALLBACK_ID);
}

module.exports = { SCRIPTS, listScripts, getScript, selectScript };
