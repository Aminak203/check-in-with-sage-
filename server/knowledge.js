const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Company documentation — the runtime half of the knowledge pipeline
// ---------------------------------------------------------------------------
// Both artifacts here are built offline by server/scripts/build-knowledge.js
// from the Supabase `skills` bucket and committed, so a request never touches
// storage. They are used in two deliberately different ways:
//
//   DOCTRINE_NOTE — the distilled behavioural rules (manifesto, values, product
//     principles, responsible AI, ethics). ALWAYS appended to the system prompt.
//     These are guardrails, and a guardrail retrieved on demand is no guardrail:
//     "never provide misleading reassurance" has to be in force on the turn
//     where Sorra is tempted to reassure, which is exactly the turn where
//     nothing in the conversation resembles the rule.
//
//   retrieveKnowledge() — the commercial/strategy docs (customer segments,
//     value proposition, positioning, go-to-market). These must NOT colour an
//     ordinary check-in, so they are injected only when the person asks a
//     question that genuinely matches them. Two independent gates keep them out
//     of emotional conversation: the message has to look like a question, and
//     the best-matching chunk has to clear a similarity floor.
//
// Every load is best-effort. If an artifact is missing (never built) or stale,
// the feature switches itself off and Sorra behaves exactly as she did before.
// ---------------------------------------------------------------------------

const DOCTRINE_PATH = path.join(__dirname, "knowledge.doctrine.md");
const DATA_PATH = path.join(__dirname, "knowledge.data.json");
const EMBEDDINGS_PATH = path.join(__dirname, "knowledge.embeddings.json");

function readIfPresent(file, label) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`Could not read ${label}:`, err.message);
    return null;
  }
}

// --- always-on doctrine ------------------------------------------------------
const DOCTRINE_NOTE = (() => {
  const raw = readIfPresent(DOCTRINE_PATH, "the doctrine block");
  if (!raw || !raw.trim()) return "";
  return "\n\n" + raw.trim();
})();

// --- on-demand reference retrieval -------------------------------------------
let CHUNKS = null; // [{ id, docTitle, label, text }]
let VECTORS = null; // { id: number[] }
let ANCHORS = null; // { product: number[], personal: number[] }

(function loadReference() {
  const rawData = readIfPresent(DATA_PATH, "the knowledge index");
  const rawVectors = readIfPresent(EMBEDDINGS_PATH, "the knowledge embeddings");
  if (!rawData || !rawVectors) return;
  try {
    const data = JSON.parse(rawData);
    const embeddings = JSON.parse(rawVectors);
    const chunks = data.chunks || [];
    if (!chunks.length) return;
    if (!chunks.every((c) => Array.isArray(embeddings.vectors?.[c.id]))) {
      console.warn(
        "Knowledge embeddings are stale (chunks changed) — run `npm run build:knowledge`. On-demand company answers are disabled."
      );
      return;
    }
    // The subject gate is not optional: without it, distress talk pulls in the
    // commercial docs. An index built before the gate existed is treated as
    // unusable rather than served without its safety filter.
    if (!Array.isArray(embeddings.anchors?.product) || !Array.isArray(embeddings.anchors?.personal)) {
      console.warn(
        "Knowledge embeddings predate the subject gate — run `npm run build:knowledge`. On-demand company answers are disabled."
      );
      return;
    }
    CHUNKS = chunks;
    VECTORS = embeddings.vectors;
    ANCHORS = embeddings.anchors;
  } catch (err) {
    console.warn("Could not load the knowledge index:", err.message);
  }
})();

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

// How many chunks we hand the model once the gates have passed.
const RETRIEVE_K = 3;

// A weak floor, not a safety filter. By the time we test it, the subject gate
// has already established the person is asking about the product, so this only
// drops chunks unrelated to the question and can never let anything into an
// emotional conversation. It is deliberately loose: correct answers routinely
// score in the 0.24-0.35 band here, because a short spoken question shares few
// words with a heading-structured strategy document, and a partially-relevant
// chunk is fine when the injected note tells Sorra to admit she does not know.
const MIN_SIMILARITY = 0.2;

// The subject gate's decision boundary. A message qualifies when it sits closer
// to the "asking about the product" anchors than the "telling us how I feel"
// anchors. Zero is the natural boundary and the measured gap around it is wide
// (personal messages reach -0.20, product questions start at +0.14), so this
// small positive margin costs nothing and keeps ambiguous messages out.
const SUBJECT_MARGIN = 0.05;

// Gate one: a cheap shape test that avoids paying for an embedding on the many
// turns of a check-in that are statements, not questions. Generous on purpose,
// since the subject gate below is what actually decides.
const QUESTION_SHAPE =
  /\?|^\s*(what|who|why|how|when|where|which|is|are|was|were|do|does|did|can|could|will|would|should|tell me|explain)\b/i;

function looksLikeQuestion(text) {
  return QUESTION_SHAPE.test((text || "").trim());
}

// Gate two: is this question ABOUT the product, or about the person? See the
// ANCHORS comment in build-knowledge.js for why similarity to the documents
// cannot answer this and a separate subject test is needed.
function isAboutProduct(queryVector) {
  return (
    cosineSimilarity(queryVector, ANCHORS.product) -
      cosineSimilarity(queryVector, ANCHORS.personal) >
    SUBJECT_MARGIN
  );
}

// The framing around the retrieved text. This matters as much as the retrieval:
// the chunks are commercial documents, and without a tight instruction the
// model will happily brief a struggling employee on buying objections. So the
// snippets are presented as background for a short answer, never as material to
// recite, and the reply is steered straight back to the person.
function buildKnowledgeNote(snippets) {
  const body = snippets.map((s) => `### ${s.label}\n${s.text}`).join("\n\n");
  return `\n\n## Background about Pause with Sorra (retrieved because of what they just asked)\n${body}\n\nUse this ONLY if it directly answers their question. Answer in your own warm words, one or two sentences, then return to how they are feeling. Do not quote or summarise these notes at length, do not volunteer commercial detail such as pricing, customers, competitors or market strategy, and do not let this material shape a conversation that is really about how someone is doing. If none of it answers what they asked, say plainly and kindly that you do not know, and gently steer back to them.`;
}

// Returns the block to append to the system prompt, or "" when nothing applies.
// Never throws: an embedding failure here must not cost the person their reply.
async function retrieveKnowledge(messages) {
  if (!CHUNKS) return "";

  const lastUser = [...(messages || [])].reverse().find((m) => m && m.role === "user");
  const query = lastUser?.content || "";
  if (!query.trim() || !looksLikeQuestion(query)) return "";

  let queryVector;
  try {
    // Required lazily: llm.js loads this module for DOCTRINE_NOTE, so a
    // top-level require here would be a cycle. By call time both are resolved.
    const { embed } = require("./llm");
    queryVector = await embed(query);
  } catch (err) {
    console.error("Knowledge retrieval embedding failed, answering without it:", err.message);
    return "";
  }

  if (!isAboutProduct(queryVector)) return "";

  const ranked = CHUNKS.map((c) => ({ chunk: c, score: cosineSimilarity(queryVector, VECTORS[c.id]) }))
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score >= MIN_SIMILARITY)
    .slice(0, RETRIEVE_K);

  if (!ranked.length) return "";
  return buildKnowledgeNote(ranked.map((r) => r.chunk));
}

module.exports = { DOCTRINE_NOTE, retrieveKnowledge, looksLikeQuestion, isAboutProduct };
