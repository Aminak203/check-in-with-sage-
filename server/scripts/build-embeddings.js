// ---------------------------------------------------------------------------
// build-embeddings.js — precompute the retrieval vectors for the script catalog.
//
// Usage:  node server/scripts/build-embeddings.js   (needs OPENAI_API_KEY set)
//
// This is the "index" step of RAG for script selection. We embed each script's
// `use` description (plus its name for a little extra signal) ONCE and write the
// vectors to server/scripts.embeddings.json. At request time, selectScript()
// embeds the live conversation and compares against these precomputed vectors —
// so there is zero per-request cost for the catalog side.
//
// Re-run this whenever you add/edit a script or change a `use` description
// (i.e. after editing scripts.js QUICK_SCRIPTS or re-running build-scripts.js).
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { SCRIPTS } = require("../scripts");
const { embed, EMBED_MODEL } = require("../llm");

const OUT_PATH = path.join(__dirname, "..", "scripts.embeddings.json");

// The exact text we embed per script. Keep this in sync with what selectScript
// treats as the "meaning" of a script — its name + when-to-use description.
function embedText(script) {
  return `${script.name}. ${script.use}`;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — cannot generate embeddings.");
    process.exit(1);
  }

  const vectors = {};
  for (const script of SCRIPTS) {
    process.stdout.write(`embedding ${script.id.padEnd(26)} `);
    vectors[script.id] = await embed(embedText(script));
    console.log(`ok (${vectors[script.id].length} dims)`);
  }

  const payload = {
    model: EMBED_MODEL,
    // Stored so selectScript can warn if the catalog changed since indexing.
    ids: SCRIPTS.map((s) => s.id),
    vectors,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload), "utf8");
  console.log(
    `\nWrote ${path.relative(process.cwd(), OUT_PATH)} (${SCRIPTS.length} scripts, model ${EMBED_MODEL})`
  );
}

main().catch((err) => {
  console.error("Failed to build embeddings:", err.message || err);
  process.exit(1);
});
