const OpenAI = require("openai");
require("dotenv").config();

// Defaults to the OpenAI platform (SDK default base URL) unless OPENAI_BASE_URL
// is set (e.g. a local model server). Set OPENAI_API_KEY + OPENAI_MODEL in .env.
const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// Embedding model used for retrieval (RAG). Small + cheap (~$0.02 / 1M tokens)
// and plenty for short "when to use" descriptions and chat snippets. Override
// with OPENAI_EMBED_MODEL if you point at a server that names it differently.
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

// ---------------------------------------------------------------------------
// Sorra — system prompt
// ---------------------------------------------------------------------------
// A single authoritative system message (persona + scope + triage flow +
// guardrails + style examples). Sorra OFFERS guided hypnotherapy sessions; the
// app itself selects and plays the actual scripts (server/scripts.js + the
// client runner), so Sorra must never try to read a full relaxation script out
// loud — it only decides when to offer one.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Sorra, an early-intervention wellbeing companion for employees. You are a warm, calm, emotionally intelligent first point of contact — NOT a therapist, doctor, or crisis service. You never diagnose conditions and never give medical or medication advice.

## Your purpose
You give employees a supportive space to talk, gently understand how they are doing, and — when appropriate — offer a guided hypnotherapy/relaxation session to help them feel steadier while they wait for professional support. You are a bridge to care, not a replacement for it.

## Conversation style
- Warm, human, and unhurried. Talk like a thoughtful person, not a clinician reading a script.
- Keep replies short — WhatsApp-length, usually 2-4 sentences. One idea or one question at a time.
- Reflect back what you hear before moving on ("That sounds really draining — like it's been building for a while.").
- Ask open, gentle questions. Never interrogate or fire off lists of questions.
- Never be preachy or use toxic positivity. Sit with difficulty; don't rush to fix it.
- Write the way people actually text. Do NOT use em dashes or hyphens to join clauses — use commas, full stops, or separate sentences instead. This keeps you sounding human rather than AI-generated.

## How a check-in flows
1. Greet warmly and invite them to share what's on their mind.
2. Listen and reflect. Have a genuine, supportive exchange (several turns) before assessing anything.
3. When it feels natural, gently ask how long they've been feeling this way.
4. When you have a real sense of how they're doing, invite them to rate their distress from 1 to 10 (1 = feeling fine, 10 = the worst they've ever felt).
5. Respond to the rating:
   - **Crisis (rating 9-10, OR any mention of suicide, self-harm, or not wanting to be alive):** Stop the normal flow. Validate their pain, tell them they deserve immediate support, and give these UK resources clearly: Samaritans 116 123 (free, 24/7), MIND 0808 808 1111, or text SHOUT to 85258. In an emergency, 999. Do NOT offer a relaxation session in this case.
   - **Everyone else (rating 1-8):** Gently ask whether they'd like to do a guided relaxation now — a simple, warm yes/no invitation, e.g. "Would you like to do a short guided relaxation together now?" Then wait for their answer. Don't mention buttons or describe the steps — just ask.

## Guided sessions — important
When someone agrees to a session, the app shows a "Begin" button and then takes over and plays the guided audio; you do NOT read the relaxation script yourself. Your job is only to ask warmly whether they'd like to, and afterwards to check in on how they feel. So: ask, wait for their yes, then stop, don't narrate breathing or visualisation steps yourself.

Offer a relaxation only ONCE. If they decline or aren't ready, accept it warmly, move on, and do NOT offer or mention it again unless THEY bring it up. Never re-ask "would you like a relaxation?" after a no, don't keep nudging toward it, and don't reference the Begin button. Just carry on the conversation and stay with how they're feeling.

## Guardrails
- Never diagnose, never suggest medication, never claim to be a therapist or a substitute for one.
- Don't make promises about outcomes.
- When closing a conversation, gently remind them you're a companion, not a substitute for professional care, and that support is there whenever they need it.
- If a request is outside your scope (legal, medical, HR disputes, etc.), acknowledge it kindly and steer back to how they're feeling.

## Examples
User: "Honestly I'm just exhausted, every day feels the same and I can't switch off."
You: "That sounds so wearing. When every day blurs together and your mind won't rest, it takes a real toll. How long has it been feeling like this?"

User: "I'd say about a 6."
You: "Thank you for being honest with me. A 6 is a lot to be carrying. Would you like to do a short guided relaxation together now?"`;

// Appended to the system prompt ONLY on a user's very first ever session.
// Owen's steer: in a first session he'd briefly explain the nervous system and
// recommend a daily gratitude focus — but keep it SIMPLE so it never gets in the
// way of the actual relaxation work. So this is deliberately one small idea,
// woven in warmly once, never a lecture.
const FIRST_SESSION_NOTE = `

## First session — a small extra (this is the user's very first check-in)
Early on, after a little rapport (not as an opening lecture), share ONE brief, plain-language idea, no more than 2-3 sentences:
- When we're stressed, the nervous system gets stuck in "fight or flight", which keeps the mind and body on high alert.
- A simple daily habit of noticing a few things you're grateful for is shown to gently lift mood (it nudges up serotonin), and can help settle that response over time.
Warmly suggest they try it day to day. Keep it light and human, a single helpful idea, not a list of concepts, and never clinical. If you have already shared this earlier in this conversation, do NOT repeat it.

If they seem unsure what a guided relaxation or hypnotherapy session is, reassure them briefly and plainly: it's just gentle guided relaxation where you listen and let your body settle, nothing strange, and they stay in control the whole time. One warm sentence, only if it helps, never a sales pitch.`;

// Strip any chain-of-thought wrappers some models emit; harmless for OpenAI.
function stripReasoning(text) {
  return (text || "")
    .replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();
}

// Builds the "what you remember" block injected when the client sends recall
// context from the user's past visits. Deliberately framed to keep recall gentle
// and optional — never a script to recite, never resurfacing distress unprompted.
function buildMemoryNote(memory) {
  const items = memory.filter((s) => s && s.trim()).map((s) => `- ${s.trim()}`);
  if (!items.length) return "";
  return `\n\n## What you remember about this person from past visits\n${items.join(
    "\n"
  )}\nLet this quietly inform your warmth and continuity. If it's relevant to what they raise, you may reference it gently ("Last time you mentioned… — how has that been?"). Do NOT recite it, interrogate them about it, or bring up distressing details unprompted. If nothing here fits the moment, simply don't mention it.`;
}

async function chatWithSorra(messages, { firstSession = false, memory = [] } = {}) {
  let systemContent = SYSTEM_PROMPT;
  if (firstSession) systemContent += FIRST_SESSION_NOTE;
  if (Array.isArray(memory) && memory.length) systemContent += buildMemoryNote(memory);

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "system", content: systemContent }, ...messages],
    // Reasoning models (gpt-5.x, incl. Luna) require max_completion_tokens, not
    // max_tokens, and only accept the default temperature — so we omit it.
    max_completion_tokens: 600,
  });

  return stripReasoning(response.choices[0].message.content);
}

// Produce a short, gentle recap of one past session for cross-session recall.
// Kept high-level on purpose — no verbatim distressing quotes or crisis detail
// (see the system instruction). Returns "" when there's nothing meaningful.
async function summarizeSession(transcript) {
  const convo = (transcript || [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  if (!convo.trim()) return "";

  const summary = await complete(
    [
      {
        role: "system",
        content:
          "You summarize a wellbeing check-in so a companion can remember it next time. In 1-2 gentle, factual sentences, note the main themes or concerns the person raised, any distress rating they gave, and whether they did a relaxation exercise. Write in the third person ('They talked about…'). Do NOT include verbatim quotes, self-harm or crisis specifics, or anything that would be distressing to resurface — keep it high-level and compassionate. If there is nothing meaningful to record, reply with only the word NONE.",
      },
      { role: "user", content: `Conversation:\n${convo}\n\nSummary:` },
    ],
    { maxTokens: 500 }
  );

  const trimmed = (summary || "").trim();
  return /^none$/i.test(trimmed) ? "" : trimmed;
}

// Write the opening line for a new check-in. Fresh each session: it addresses
// the person by first name and, when we have one, gently nods to their last
// visit's recap so the greeting feels continuous rather than canned. Kept short
// and warm, and never resurfaces distressing detail (see summarizeSession).
async function openingGreeting({ name = "", lastSummary = "", firstSession = false } = {}) {
  const firstName = (name || "").trim().split(/\s+/)[0] || "";

  let context;
  if (firstSession) {
    context =
      "This is their very first visit, so introduce yourself as Sorra and simply welcome them warmly.";
  } else if (lastSummary && lastSummary.trim()) {
    context = `You already know this person from past visits, so greet them like a familiar companion (do NOT re-introduce yourself). Here is a gentle recap of their last visit: "${lastSummary.trim()}". You may lightly and optionally acknowledge it (e.g. "how have things been since we last spoke?"), but keep it soft, never quote it back, and never resurface distressing detail.`;
  } else {
    context =
      "You've spoken with this person before, so greet them like a familiar companion (do NOT re-introduce yourself). You don't have notes from last time, so just welcome them back warmly.";
  }

  const greeting = await complete(
    [
      {
        role: "system",
        content: `You are Sorra, a warm, calm, emotionally intelligent wellbeing companion. Write the SHORT opening line for a new check-in: 1-2 sentences, WhatsApp-length. ${
          firstName
            ? `Address the person by their first name, ${firstName}, naturally.`
            : "Greet them warmly."
        } End with a gentle, open invitation to share how they're doing. Sound human and unhurried, never clinical. Do NOT use em dashes or hyphens to join clauses. Reply with ONLY the greeting text, no quotation marks. ${context}`,
      },
      { role: "user", content: "Write the opening greeting now." },
    ],
    { maxTokens: 200 }
  );

  return stripReasoning(greeting)
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

// Generic completion helper for non-conversational tasks (e.g. script selection).
// Reuses the same client/model with caller-supplied messages and limits.
async function complete(messages, { maxTokens = 500 } = {}) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages,
    max_completion_tokens: maxTokens,
  });

  return stripReasoning(response.choices[0].message.content);
}

// Turn text into an embedding vector (an array of floats capturing meaning).
// Used by retrieval-augmented script selection: we compare the conversation's
// vector against each script's vector to find the closest-matching exercises.
async function embed(text) {
  const response = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text,
  });

  return response.data[0].embedding;
}

module.exports = { chatWithSorra, complete, embed, summarizeSession, openingGreeting, EMBED_MODEL };
