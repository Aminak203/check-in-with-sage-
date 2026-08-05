// ---------------------------------------------------------------------------
// build-knowledge.js — pull the company documentation out of the Supabase
// `skills` storage bucket and turn it into the two artifacts Sorra uses.
//
// Usage:  node server/scripts/build-knowledge.js          (needs OPENAI_API_KEY)
//         node server/scripts/build-knowledge.js --force  (also re-distil the
//                                                          doctrine block)
//
// The docs are NOT all the same kind of thing, so they are NOT treated the same
// way (see `kind` in CATALOG below):
//
//   kind: "doctrine"  — how Sorra should behave (manifesto, values, product
//     principles, responsible AI, ethics). Guardrails have to apply on EVERY
//     turn, so these can't be retrieved on demand: a rule like "never provide
//     misleading reassurance" is needed precisely when nobody has mentioned
//     reassurance. Instead they are distilled ONCE into knowledge.doctrine.md,
//     which server/llm.js appends to the system prompt for every request.
//
//   kind: "reference" — commercial/strategy material (customer segments, value
//     proposition, positioning, go-to-market). This must never colour an
//     ordinary check-in, but Sorra should be able to answer a direct question
//     like "who is behind this?". So it is chunked + embedded here and pulled
//     in only when the person actually asks something it matches
//     (see retrieveKnowledge in server/knowledge.js).
//
// Outputs (all committed, so production never touches the bucket at runtime):
//   server/knowledge.doctrine.md      — the always-on prompt block
//   server/knowledge.data.json        — reference chunks + source hashes
//   server/knowledge.embeddings.json  — one vector per reference chunk
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const { complete, embed, EMBED_MODEL } = require("../llm");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://jbptubtpchgappccrhfs.supabase.co";
const BUCKET = process.env.KNOWLEDGE_BUCKET || "skills";

const OUT_DIR = path.join(__dirname, "..");
const DOCTRINE_PATH = path.join(OUT_DIR, "knowledge.doctrine.md");
const DATA_PATH = path.join(OUT_DIR, "knowledge.data.json");
const EMBEDDINGS_PATH = path.join(OUT_DIR, "knowledge.embeddings.json");

// --- catalog: bucket object -> how Sorra may use it -------------------------
// `file` is the object name in the bucket exactly as stored (spaces and all —
// we URL-encode when fetching). Add a row here when a new doc is uploaded; the
// bucket audit below prints anything present in storage but missing from this
// list, so a new upload is never silently ignored.
//
// Docs in the bucket we deliberately do NOT ingest, and why. Kept separate from
// a plain omission so the audit can stay quiet about these while still shouting
// about genuinely new uploads — otherwise a known exclusion nags on every build
// and the one message that matters gets lost in the noise.
const EXCLUDED = {
  "07Business Model __Pause_with_Sorra.md":
    "byte-identical to 06 Product Principles (wrong file uploaded). Indexing it " +
    "would duplicate every chunk and skew retrieval. Move it into CATALOG once a " +
    "real business-model doc replaces it.",
};

const CATALOG = [
  { file: "01_Founder_Manifesto_Pause_with_Sorra.md", id: "manifesto", title: "Founder Manifesto", kind: "doctrine" },
  { file: "02_Vision_Mission_Values_Pause_with_Sorra.md", id: "vision-values", title: "Vision, Mission & Values", kind: "doctrine" },
  { file: "03_Customer_Segments_Pause_with_Sorra.md", id: "customer-segments", title: "Customer Segments", kind: "reference" },
  { file: "04-Value-Proposition-PausewithSorrav1.md", id: "value-proposition", title: "Value Proposition", kind: "reference" },
  { file: "05_Positioning_Pause_with_Sorra.md", id: "positioning", title: "Positioning", kind: "reference" },
  { file: "06_Product Principles_Pause_with_Sorra.md", id: "product-principles", title: "Product Philosophy & Principles", kind: "doctrine" },
  { file: "08_Go to Market __Pause_with_Sorra.md", id: "go-to-market", title: "Go-to-Market Strategy", kind: "reference" },
  { file: "09_Responsible AI __Pause_with_Sorra.md", id: "responsible-ai", title: "Responsible AI & Trust Framework", kind: "doctrine" },
  { file: "10_Ethics __Pause_with_Sorra.md", id: "ethics", title: "Ethics Framework", kind: "doctrine" },
];

// --- fetching ---------------------------------------------------------------
const publicUrl = (file) =>
  `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(file)}`;

async function fetchDoc(file) {
  const res = await fetch(publicUrl(file));
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status} ${res.statusText}`);
  return (await res.text()).replace(/\r\n/g, "\n");
}

// Compare the bucket's actual contents against CATALOG so uploads don't get
// missed. Listing objects needs a service-role key (the anon key can download
// from a public bucket but can't enumerate it), so this is best-effort: without
// the key we just skip the audit rather than fail the build.
async function auditBucket() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.log(
      "(set SUPABASE_SERVICE_ROLE_KEY in .env to have this build flag newly-uploaded docs)\n"
    );
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 1000, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objects = await res.json();
    const known = new Set(CATALOG.map((d) => d.file));
    const names = objects.map((o) => o.name).filter((n) => n.endsWith(".md"));

    const unknown = names.filter((n) => !known.has(n) && !EXCLUDED[n]);
    if (unknown.length) {
      console.log("NEW docs in the bucket that this build ignores — add them to CATALOG:");
      for (const n of unknown) console.log(`  ! ${n}`);
      console.log("");
    }

    // A doc listed as excluded that has since been replaced is worth surfacing:
    // the reason on file may no longer hold.
    const stillExcluded = names.filter((n) => EXCLUDED[n]);
    for (const n of stillExcluded) {
      console.log(`  (skipping ${n} — ${EXCLUDED[n]})\n`);
    }

    // A catalogued doc that has vanished from the bucket would otherwise fail
    // the download with a bare 404 further down.
    const missing = CATALOG.map((d) => d.file).filter((f) => !names.includes(f));
    if (missing.length) {
      console.log("In CATALOG but NOT in the bucket (the fetch below will fail):");
      for (const n of missing) console.log(`  ! ${n}`);
      console.log("");
    }
  } catch (err) {
    console.warn(`Bucket audit skipped (${err.message})\n`);
  }
}

// --- chunking (reference docs only) -----------------------------------------
// These docs are heading-structured, so a heading is the natural chunk edge:
// each section is one self-contained idea. We carry the doc title and heading
// path into the chunk text because that context is what the query has to match
// against ("who pays for this?" -> "Customer Segments / Primary Customer").
const MAX_CHUNK_WORDS = 220;
const MIN_CHUNK_WORDS = 12;

const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;

// Drop pandoc's horizontal rules and the boilerplate title/version lines that
// open every doc; they carry no meaning and would dilute the embedding.
function cleanLine(line) {
  const t = line.replace(/\s+$/, "");
  if (/^-{3,}$/.test(t.trim())) return null;
  if (/^#{1,3}\s*Version\s+[\d.]+\s*$/i.test(t.trim())) return null;
  if (/^#{1,2}\s*Pause with Sorra\s*$/i.test(t.trim())) return null;
  return t;
}

function chunkDoc(doc, text) {
  const sections = [];
  let heading = null;
  let buf = [];

  const flush = () => {
    const body = buf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    buf = [];
    if (wordCount(body) < MIN_CHUNK_WORDS) return;
    sections.push({ heading, body });
  };

  for (const raw of text.split("\n")) {
    const line = cleanLine(raw);
    if (line === null) continue;
    const m = line.match(/^(#{1,3})\s+(.*)$/);
    if (m) {
      flush();
      heading = m[2].trim();
      continue;
    }
    buf.push(line);
  }
  flush();

  // A section longer than a comfortable chunk is split on blank lines rather
  // than mid-sentence, so every chunk still reads as whole prose.
  const out = [];
  for (const s of sections) {
    const label = s.heading ? `${doc.title} — ${s.heading}` : doc.title;
    if (wordCount(s.body) <= MAX_CHUNK_WORDS) {
      out.push({ label, body: s.body });
      continue;
    }
    let acc = [];
    let n = 0;
    for (const para of s.body.split(/\n{2,}/)) {
      acc.push(para);
      n += wordCount(para);
      if (n >= MAX_CHUNK_WORDS) {
        out.push({ label, body: acc.join("\n\n") });
        acc = [];
        n = 0;
      }
    }
    if (acc.length) out.push({ label, body: acc.join("\n\n") });
  }

  return out.map((c, i) => ({
    id: `${doc.id}#${i}`,
    docId: doc.id,
    docTitle: doc.title,
    label: c.label,
    text: c.body,
  }));
}

// The exact string we embed. Retrieval matches a user's question against the
// heading path as much as the prose, so the label is part of the vector.
const embedText = (chunk) => `${chunk.label}\n${chunk.text}`;

// --- subject anchors ---------------------------------------------------------
// Chunk similarity alone CANNOT tell "asking about the product" apart from
// "telling us how I feel". Measured against this catalog, distress messages
// score up to 0.384 against a chunk while real product questions bottom out at
// 0.320, so the two bands overlap and no threshold separates them. The reason is
// in the source material: the commercial docs' "The Problem" / "End Users" /
// "Jobs To Be Done" sections describe employee distress, so they legitimately
// look like a person describing their distress.
//
// So the gate discriminates on SUBJECT instead of similarity. We embed two sets
// of prototype messages, average each into a centroid, and at request time ask
// which centroid the message is closer to. On the same test set that separates
// cleanly: personal messages land at -0.46 to -0.20, product questions at +0.14
// to +0.52, a gap of 0.33 either side of zero.
//
// Edit these lists if the gate ever misjudges a real message, then rebuild.
const ANCHORS = {
  product: [
    "What is this app for?",
    "Who is behind this service?",
    "What company made this?",
    "Who pays for this platform?",
    "How is this different from other wellbeing apps?",
    "Is this a replacement for therapy or occupational health?",
    "How does this product work?",
    "Who are your customers?",
    "Does my employer see what I say here?",
    "What can you actually do?",
  ],
  personal: [
    "Why do I always feel like this?",
    "How do I stop overthinking at night?",
    "I can't cope with work anymore.",
    "What should I tell my boss about how I'm feeling?",
    "Can you help me sleep better?",
    "Is it normal to feel this anxious?",
    "I feel exhausted all the time.",
    "How do I calm down when I'm panicking?",
    "Why is my mind so busy?",
    "What can I do about my stress?",
  ],
};

function centroid(vectors) {
  const out = new Array(vectors[0].length).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i];
  return out.map((x) => x / vectors.length);
}

async function buildAnchors() {
  const result = {};
  for (const [name, phrases] of Object.entries(ANCHORS)) {
    const vectors = [];
    for (const phrase of phrases) vectors.push(await embed(phrase));
    result[name] = centroid(vectors);
  }
  return result;
}

// --- doctrine distillation ---------------------------------------------------
// The five doctrine docs run to ~19k characters, most of it addressed to the
// team rather than to Sorra (governance, lifecycle stages, "success looks like
// ... for organisations"). Pasting all of it into the system prompt would cost
// thousands of tokens per turn to say things the prompt largely already says.
// So we distil once, at build time, into a compact block of behavioural rules.
//
// This is the one non-deterministic step, which is why the result is written to
// a file you can read and hand-edit: it is only regenerated when the file is
// missing or --force is passed. The source hashes recorded in
// knowledge.data.json let the build warn you when the docs have moved on.
const DISTIL_PROMPT = `You are compiling internal company documents into a block of behavioural rules that will be appended to the system prompt of "Sorra", an AI wellbeing companion that talks with employees who may be struggling.

Read the documents and extract ONLY what changes how Sorra should behave in a conversation: how she should speak, what she must always do, and what she must never do.

Rules for your output:
- Output GitHub-flavoured markdown starting with the heading "## Our principles (how you must always behave)". No preamble, no closing commentary.
- Use short imperative bullets addressed to Sorra as "you".
- Include a clearly marked group of absolute prohibitions.
- EXCLUDE anything that is not about conversational behaviour: commercial strategy, customers, pricing, markets, competitors, team culture, governance processes, product lifecycle stages, feature decision frameworks, organisational outcomes, or success metrics.
- Do not restate generic chatbot advice. Only what these documents actually commit to.
- Merge duplicates across the documents into single bullets.
- Do NOT use em dashes or hyphens to join clauses; use commas or separate sentences.
- Keep the whole block under 350 words.`;

async function distilDoctrine(docs) {
  const corpus = docs.map((d) => `===== ${d.title} =====\n${d.text}`).join("\n\n");
  const out = await complete(
    [
      { role: "system", content: DISTIL_PROMPT },
      { role: "user", content: `${corpus}\n\nProduce the behavioural rules block now.` },
    ],
    { maxTokens: 4000 }
  );
  const trimmed = (out || "").trim();
  if (!trimmed) throw new Error("distillation returned nothing");
  return trimmed;
}

// --- main --------------------------------------------------------------------
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — cannot build the knowledge index.");
    process.exit(1);
  }
  if (typeof fetch !== "function") {
    console.error("Global fetch is unavailable — Node 18 or newer is required.");
    process.exit(1);
  }

  const force = process.argv.includes("--force");

  console.log(`Reading ${CATALOG.length} docs from ${SUPABASE_URL}/${BUCKET}\n`);
  await auditBucket();

  const docs = [];
  for (const meta of CATALOG) {
    process.stdout.write(`  ${meta.id.padEnd(20)} `);
    const text = await fetchDoc(meta.file);
    docs.push({ ...meta, text });
    console.log(`${String(text.length).padStart(6)} chars  [${meta.kind}]`);
  }

  const sources = Object.fromEntries(docs.map((d) => [d.id, sha(d.text)]));

  // --- doctrine ---
  const doctrineDocs = docs.filter((d) => d.kind === "doctrine");
  const previous = fs.existsSync(DATA_PATH)
    ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8"))
    : null;
  const doctrineChanged = doctrineDocs.some((d) => previous?.sources?.[d.id] !== sources[d.id]);

  if (force || !fs.existsSync(DOCTRINE_PATH)) {
    console.log(`\nDistilling ${doctrineDocs.length} doctrine docs into the prompt block...`);
    const block = await distilDoctrine(doctrineDocs);
    fs.writeFileSync(DOCTRINE_PATH, block + "\n", "utf8");
    console.log(`Wrote ${path.basename(DOCTRINE_PATH)} (${wordCount(block)} words)`);
  } else if (doctrineChanged) {
    console.log(
      `\n! ${path.basename(DOCTRINE_PATH)} is out of date: a doctrine doc changed in the bucket.` +
        "\n  Re-run with --force to regenerate it (it will be overwritten, so review the diff)."
    );
  } else {
    console.log(`\n${path.basename(DOCTRINE_PATH)} is up to date.`);
  }

  // --- reference chunks ---
  const chunks = docs.filter((d) => d.kind === "reference").flatMap((d) => chunkDoc(d, d.text));
  console.log(`\nEmbedding ${chunks.length} reference chunks...`);

  const vectors = {};
  for (const chunk of chunks) {
    vectors[chunk.id] = await embed(embedText(chunk));
  }

  console.log("Embedding the subject-gate anchors...");
  const anchors = await buildAnchors();

  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(
      {
        sources,
        // Recorded so the gate's behaviour is reviewable without reading the
        // build script, and so a change to the wording is visible in the diff.
        anchorPhrases: ANCHORS,
        chunks: chunks.map(({ id, docId, docTitle, label, text }) => ({ id, docId, docTitle, label, text })),
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    EMBEDDINGS_PATH,
    JSON.stringify({ model: EMBED_MODEL, ids: chunks.map((c) => c.id), vectors, anchors }),
    "utf8"
  );

  const perDoc = {};
  for (const c of chunks) perDoc[c.docTitle] = (perDoc[c.docTitle] || 0) + 1;
  for (const [title, n] of Object.entries(perDoc)) {
    console.log(`  ${title.padEnd(28)} ${String(n).padStart(3)} chunks`);
  }
  console.log(
    `\nWrote ${path.basename(DATA_PATH)} + ${path.basename(EMBEDDINGS_PATH)} (model ${EMBED_MODEL})`
  );
}

main().catch((err) => {
  console.error("Failed to build knowledge:", err.message || err);
  process.exit(1);
});
