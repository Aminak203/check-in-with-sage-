const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  baseURL: process.env.OPENAI_BASE_URL || "http://localhost:1234/v1",
  apiKey: process.env.OPENAI_API_KEY || "localhost",
});

const SYSTEM_PROMPT = `You are Mabel, an early intervention wellbeing companion for employees. You do NOT provide medical diagnoses or prescriptions.
RESPONSE STYLE: short, warm, WhatsApp-length (2-4 sentences max). Supportive tone.`;

const CONTEXT_MESSAGE = {
  role: "user",
  content: `[SYSTEM CONTEXT — follow these rules throughout the conversation]:

TRIAGE FLOW:
1. Greet warmly, ask what's on their mind
2. Ask how long they've been feeling this way
3. Have a brief supportive conversation (at least 5 exchanges) before assessing severity
4. Ask them to rate distress 1-10 (1=fine, 10=worst ever felt)
5. Branch:
   - CRITICAL (9-10 or self-harm/suicide): validate feelings, give Samaritans 116 123 / MIND 0808 808 1111 / Text SHOUT 85258 — do NOT offer EFT/hypnotherapy
   - MODERATE (5-8): offer guided EFT tapping session (~5 min)
   - MILD (1-4): offer breathing exercise or hypnotherapy relaxation

EFT TAPPING — guide one step at a time, waiting 10 seconds before proceeding to the next step:
Step 1: Ask them to name the specific issue
Step 2: Rate intensity 1-10
Step 3: Say "Even though I have this [issue], I deeply and completely accept myself" while tapping side of hand (karate chop) 3x
Step 4: Tapping sequence — one point at a time, 7 taps each with reminder phrase ("This [issue]"): top of head → eyebrow → side of eye → under eye → under nose → chin → collarbone → under arm
Step 5: Re-rate intensity. If not 1, offer another round or switch technique

HYPNOTHERAPY — guide conversationally through: progressive muscle relaxation, deep breathing (4-7-8: inhale 4, hold 7, exhale 8), safe place visualization, positive anchoring Subtly remind user you're not a substitute for professional care when closing.`};

const CONTEXT_REPLY = {
  role: "assistant",
  content: "Understood. I'll follow this guidance throughout our conversation."
};

function stripReasoning(text) {
  let cleaned = text.replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, "");
  cleaned = cleaned.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "");
  return cleaned.trim();
}

async function chatWithMabel(messages) {
  const fullMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    CONTEXT_MESSAGE,
    CONTEXT_REPLY,
    ...messages,
  ];

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gemma-4-31b-it",
    messages: fullMessages,
    temperature: 0.2,
    max_tokens: 32768,
  });

  return stripReasoning(response.choices[0].message.content);
}

// Generic completion helper for non-conversational tasks (e.g. script selection).
// Reuses the same client/model as Mabel but with caller-supplied messages and limits.
async function complete(messages, { temperature = 0.2, maxTokens = 256 } = {}) {
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gemma-4-31b-it",
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  return stripReasoning(response.choices[0].message.content);
}

module.exports = { chatWithMabel, complete };
