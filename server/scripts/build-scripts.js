// ---------------------------------------------------------------------------
// build-scripts.js — regenerate server/scripts.data.json from the clinical
// hypnotherapy Word documents.
//
// Usage:  node server/scripts/build-scripts.js   (add DEBUG=1 to log dropped
//         header/title lines while tuning the filters)
//
// Source docs live in  "hypnotherapy scripts docs/"  at the repo root. This
// script reads each .docx directly (a .docx is a ZIP; we inflate its
// word/document.xml with Node's built-in zlib — no external tools or deps),
// strips the titles / section headers / word-count notes / stray AI-chat
// preamble, then chunks the prose into uniformly-paced spoken `steps`.
//
// Only the files listed in CATALOG below are imported, each mapped to a stable
// id + display name + `use` description (the `use` string is the ONLY thing the
// selection LLM sees, so keep it an accurate plain-language "when to use").
// Add a doc here to include it; edit a doc and re-run to refresh its steps.
// ---------------------------------------------------------------------------

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DOCS_DIR = path.join(__dirname, "..", "..", "hypnotherapy scripts docs");
const OUT_PATH = path.join(__dirname, "..", "scripts.data.json");

// --- .docx text extraction --------------------------------------------------
// Pull word/document.xml out of the ZIP by walking local file headers, then
// reduce the WordprocessingML to plain text (one line per <w:p> paragraph).
function extractDocxText(file) {
  const buf = fs.readFileSync(file);
  const SIG = 0x04034b50; // local file header
  for (let i = 0; i + 30 <= buf.length; ) {
    if (buf.readUInt32LE(i) !== SIG) {
      i++;
      continue;
    }
    const flags = buf.readUInt16LE(i + 6);
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.toString("utf8", i + 30, i + 30 + nameLen);
    const dataStart = i + 30 + nameLen + extraLen;

    if (name === "word/document.xml") {
      if (flags & 0x08 || compSize === 0) {
        throw new Error(
          `${path.basename(file)}: streamed ZIP entry (data descriptor) not supported`
        );
      }
      const raw = buf.subarray(dataStart, dataStart + compSize);
      const xml =
        method === 0 ? raw.toString("utf8") : zlib.inflateRawSync(raw).toString("utf8");
      return xmlToText(xml);
    }
    i = dataStart + compSize; // skip to next entry
  }
  throw new Error(`${path.basename(file)}: word/document.xml not found`);
}

function xmlToText(xml) {
  return xml
    .replace(/<\/w:p>/g, "\n") // paragraph end -> newline
    .replace(/<[^>]*>/g, "") // strip all tags
    .replace(/&amp;/g, "&")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// --- pacing -----------------------------------------------------------------
// The client runner speaks a step then advances after `pauseMs`, and that timer
// starts when the text is shown (not when audio ends). So pauseMs must cover
// speaking time + a silence gap. Edge neural TTS in calm mode (rate -12%) with
// all the "…" pauses runs ~2 words/sec effective.
const MS_PER_WORD = 500;
const SILENCE_GAP = 3000;
const MIN_PAUSE = 4500;

// Steps: keep author stanzas whole when reasonable; split anything longer.
const MAX_STEP_WORDS = 65;
const TARGET_WORDS = 48;

const wordCount = (s) => (s.trim().match(/\S+/g) || []).length;
const pauseFor = (s) => Math.max(MIN_PAUSE, wordCount(s) * MS_PER_WORD + SILENCE_GAP);

// --- noise filters ----------------------------------------------------------
const SECTION_HEADERS = new Set([
  "induction", "deepening", "deepening into sleep", "reorientation",
  "re-orientation", "body relaxation", "calming the overactive mind",
  "letting go metaphors", "safe inner sanctuary", "positive suggestions",
  "therapeutic suggestions", "reframing the addiction",
  "future pacing & visualization", "future pacing and visualization",
  "empowerment metaphor", "subconscious integration",
  "deep healing visualization", "anchoring strength", "imagery & metaphor",
  "imagery and metaphor", "releasing stress", "drift into sleep",
  "suggestions for restorative sleep", "closing drift", "closing",
  "awakening", "deep relaxation", "integration", "paradox",
  "progressive relaxation", "tao and lp combined",
]);

// Whole-block drop: leftover AI-chat preamble / meta commentary.
const META_BLOCK =
  /got it|you'?d like|i'?ll weave|complete session-length|carefully paced|without making any direct references|themes like|chapters?\s+\d/i;

function isNoiseLine(line) {
  const t = line.trim().replace(/\s+/g, " ");
  if (!t) return true;
  if (t === "---" || /^[-–—_]{2,}$/.test(t)) return true;
  if (/hypnotherapy script/i.test(t)) return true;
  if (/\(?\s*(approx\.?|≈)[^)]*words?\s*\)?/i.test(t)) return true; // "(Approx. 2200 words)"
  if (/^\(?\s*\d[\d,]*\s*words?\s*\)?$/i.test(t)) return true; // "2200 words"
  if (/\d[\d,]*\s+words?$/i.test(t)) return true; // "...2200 words" (title echo)
  if (/^words\)?$/i.test(t)) return true;
  if (/^\d+$/.test(t)) return true; // page marker
  if (/^\(.*\)$/.test(t)) return true; // parenthetical meta e.g. "(chapters 2, 37...)"
  if (SECTION_HEADERS.has(t.toLowerCase())) return true;
  if (SECTION_HEADERS.has(t.toLowerCase().replace(/\s*[–—-].*$/, "").trim())) return true;
  return false;
}

// Does the line read like a title label rather than a sentence? True for ALL
// CAPS ("SELF-RECOGNITION") or Title Case ("The River of Release"); false for
// sentence-case content ("And every emotion you carry...").
function looksLikeTitle(t) {
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 2 && letters === letters.toUpperCase()) return true;
  const words = t.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (!words.length || !/^[A-Z]/.test(words[0])) return false;
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length;
  return capped / words.length >= 0.6;
}

// A short title-like label with no ellipsis and no sentence/continuation
// punctuation is a section header. These docs wrap sentences across lines, so
// we must NOT drop mid-sentence continuations — hence the dash/quote guards.
function isHeaderLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (t.includes("…")) return false;
  if (wordCount(t) > 7) return false;
  if (/[.!?,;:]["'"']?$/.test(t)) return false; // ends a sentence (maybe quoted)
  if (/[-–—]$/.test(t)) return false; // dash = wrapped continuation, not a header
  if (/^["'""']/.test(t)) return false; // opens a quote = content
  if (SECTION_HEADERS.has(t.toLowerCase())) return true;
  return looksLikeTitle(t);
}

// Split a long text into ~TARGET_WORDS chunks at sentence / ellipsis
// boundaries, preserving original punctuation exactly.
function splitLong(text) {
  const segs = text.split(/(?<=[….!?])\s+/).filter((s) => s.trim());
  const out = [];
  let cur = [];
  let n = 0;
  for (const seg of segs) {
    cur.push(seg);
    n += wordCount(seg);
    if (n >= TARGET_WORDS) {
      out.push(cur.join(" ").trim());
      cur = [];
      n = 0;
    }
  }
  if (cur.length) {
    const tail = cur.join(" ").trim(); // fold a tiny tail into the previous chunk
    if (out.length && wordCount(tail) < 12) out[out.length - 1] += " " + tail;
    else out.push(tail);
  }
  return out;
}

function buildSteps(text) {
  const rawLines = text.replace(/\r/g, "").replace(/ /g, " ").split("\n");

  // Group into blocks on blank lines, dropping noise / header lines as we go.
  const blocks = [];
  let cur = [];
  for (const line of rawLines) {
    if (line.trim() === "") {
      if (cur.length) blocks.push(cur), (cur = []);
      continue;
    }
    if (isNoiseLine(line)) continue;
    if (isHeaderLine(line)) {
      if (process.env.DEBUG) console.log("  DROP-HEADER:", line.trim());
      continue;
    }
    cur.push(line.trim());
  }
  if (cur.length) blocks.push(cur);

  // Turn blocks into clean content strings (drop meta blocks; pre-split any
  // block longer than a comfortable step).
  const contents = [];
  for (const block of blocks) {
    const joined = block.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) continue;
    if (META_BLOCK.test(joined) && !joined.includes("…")) continue;
    if (wordCount(joined) > MAX_STEP_WORDS) contents.push(...splitLong(joined));
    else contents.push(joined);
  }

  // Greedily merge adjacent pieces into ~TARGET_WORDS steps so pacing is uniform
  // across the very different source formats (some docs put each sentence on its
  // own line, others use long paragraphs).
  const steps = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (wordCount(t) >= 2) steps.push({ text: t, pauseMs: pauseFor(t) });
    buf = "";
  };
  for (const piece of contents) {
    buf = buf ? buf + " " + piece : piece;
    if (wordCount(buf) >= TARGET_WORDS) flush();
  }
  flush();
  return steps;
}

// --- catalog: source doc -> metadata ---------------------------------------
// `file` is the .docx basename (without extension) in DOCS_DIR. Note two source
// docs are intentionally excluded: "Anxiety lp and tao" (an earlier draft
// superseded by "Anxiety tao refined 2") and "DOWNLOAD - AI Spec Template"
// (unrelated), plus the "(1)" duplicate of the overactive-mind doc.
const CATALOG = [
  { file: "Anxiety tao refined 2", id: "anxiety-relief", name: "Easing Anxiety",
    use: "Anxious, worried, on-edge, panicky, or overwhelmed by fear and unease." },
  { file: "Calming an overactive mind", id: "calming-overactive-mind", name: "Calming an Overactive Mind",
    use: "Mind feels busy or won't switch off, mental chatter, or too many thoughts at once." },
  { file: "overthinking tao inpired", id: "overthinking", name: "Letting Go of Overthinking",
    use: "Overthinking, ruminating, replaying things, analysing everything, or stuck in thought loops." },
  { file: "Deep Sleep and Stress Release", id: "deep-sleep", name: "Deep Sleep & Stress Release",
    use: "Trouble sleeping, winding down at night, or wanting to release the day's stress and drift into rest." },
  { file: "Switching Off After Work", id: "switching-off-after-work", name: "Switching Off After Work",
    use: "Can't stop thinking about work, struggling to relax after the workday, or work follows you home." },
  { file: "Stress and Mood", id: "stress-and-mood", name: "Stress & Low Mood",
    use: "Stressed, low or flat mood, feeling down, or emotionally drained." },
  { file: "THINKING MORE POSITIVE THOUGHTS", id: "positive-thinking", name: "Thinking More Positive Thoughts",
    use: "Stuck in negative thinking, self-criticism, pessimism, or wanting a more positive outlook." },
  { file: "Self recognition new", id: "self-recognition", name: "Self-Recognition & Confidence",
    use: "Low confidence, doubting your abilities, or wanting to recognise your strengths and worth." },
  { file: "INSECURITY TAOISM INSPIRED 2500", id: "releasing-insecurity", name: "Releasing Insecurity",
    use: "Feeling insecure, not good enough, self-doubt, or comparing yourself to others." },
  { file: "Releasing Fear and Remember Worth tao", id: "releasing-fear", name: "Releasing Fear & Remembering Your Worth",
    use: "Held back by fear, feeling unworthy, or needing to reconnect with your own value." },
  { file: "self esteem break up", id: "self-esteem-breakup", name: "Self-Esteem After a Break-Up",
    use: "Hurting after a break-up or relationship ending, heartbreak, or rebuilding self-worth after rejection." },
  { file: "Addiction 2, 2200", id: "addiction-recovery", name: "Overcoming Cravings & Addiction",
    use: "Struggling with cravings, urges, or wanting to break free from a substance or habit." },
];

function main() {
  const result = [];
  for (const meta of CATALOG) {
    const docPath = path.join(DOCS_DIR, meta.file + ".docx");
    if (process.env.DEBUG) console.log("\n" + meta.file);
    const text = extractDocxText(docPath);
    const steps = buildSteps(text);
    if (!steps.length) throw new Error(`${meta.file}: produced 0 steps`);
    result.push({ id: meta.id, name: meta.name, use: meta.use, steps });
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");

  for (const s of result) {
    const words = s.steps.reduce((a, st) => a + wordCount(st.text), 0);
    const ms = s.steps.reduce((a, st) => a + st.pauseMs, 0);
    console.log(
      `${s.id.padEnd(26)} steps=${String(s.steps.length).padStart(3)}  words=${String(words).padStart(4)}  ~${Math.round(ms / 60000)}min`
    );
  }
  console.log("\nWrote", path.relative(process.cwd(), OUT_PATH), `(${result.length} scripts)`);
}

main();
