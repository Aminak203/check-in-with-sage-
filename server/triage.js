const crisisKeywords = [
  "suicide",
  "suicidal",
  "self-harm",
  "self harm",
  "self harm",
  "end my life",
  "kill myself",
  "want to die",
  "don't want to live",
  "don't want to exist",
  "hurt myself",
  "harm myself",
  "better off dead",
  "want to end it",
  "no reason to live",
  "can't go on",
  "can't take it anymore",
  "want to disappear",
  "hate myself",
  "want to hurt myself",
  "cutting",
  "overdose",
  "plan to kill",
  "wish i was dead",
  "no hope",
  "completely hopeless",
];

function detectCrisis(text) {
  const lower = text.toLowerCase();
  return crisisKeywords.some((keyword) => lower.includes(keyword));
}

const ratingPatterns = [
  /rate.*distress/i,
  /distress.*scale/i,
  /scale.*0.*10/i,
  /rate.*0.*10/i,
  /how.*would.*you.*rate/i,
  /on.*a.*scale.*of/i,
  /rate.*intensity/i,
  /intensity.*0.*10/i,
  /how.*bad.*is.*it/i,
  /0.*to.*10/i,
  /zero.*to.*ten/i,
];

function detectRatingRequest(text) {
  return ratingPatterns.some((pattern) => pattern.test(text));
}

const therapyKeywords = [
  "breathing exercise",
  "breathe in",
  "breathe out",
  "inhale",
  "exhale",
  "relax your",
  "progressive muscle",
  "safe place",
  "visualize",
  "visualise",
  "imagine a",
  "close your eyes",
  "4-7-8",
  "hypnotherapy",
  "relaxation",
];

function detectTherapyMode(text) {
  const lower = text.toLowerCase();
  return therapyKeywords.some((keyword) => lower.includes(keyword));
}

// ---------------------------------------------------------------------------
// Guided-session detection
// ---------------------------------------------------------------------------
// Every name the conversation might give a guided session. Kept in one place
// because both detectors below need it, and because the previous narrow list was
// the cause of a real failure: Sorra is told to describe the session plainly and
// never mention buttons, so she says "a short guided audio" or "the guided
// session" — neither of which the old patterns knew, so the offer was never
// surfaced and the user's "I'm ready" went nowhere.
const SESSION_NOUN =
  /(relaxation|guided (?:audio|session|recording|exercise|track|practice)|hypnotherapy|hypnosis|breathing exercise|body scan|visuali[sz]ation|guided meditation)/i;

// Phrases that make a mention an invitation or an availability signal rather
// than a passing reference. Deliberately generous: "if you'd like", "whenever
// you're ready" and "you can start" are all offers in practice.
const INVITE =
  /(would you like|do you want|want to|wanna|shall we|shall i|are you up for|are you ready|if you'?d like|if you want|when(?:ever)? you'?re ready|feel free|you can (?:start|begin|try|do)|let'?s|we could|we can|i can (?:offer|start|guide)|ready to (?:start|begin|try))/i;

// Detects when Sorra is OFFERING a guided relaxation / hypnotherapy session.
// Requires both a session mention AND an invitation, so ordinary supportive chat
// and after-the-fact references ("how did the relaxation feel?") don't fire it.
// A match only arms the yes/no gate on the client — the Begin button still waits
// for the user's answer — so erring generous here is cheap.
function detectHypnoOffer(text) {
  const t = text || "";
  return SESSION_NOUN.test(t) && INVITE.test(t);
}

// The user asking for a session THEMSELVES — the path that was missing entirely.
// Detection used to run only against Sorra's wording, so a user who said "I'm
// ready" or "can we start the relaxation" had no way to reach the Begin button.
//
// A named request ("start the relaxation") stands on its own. A bare "yes" or
// "I'm ready" is only treated as a request when a session has actually been
// discussed recently, so an affirmative about something else can't trigger it.
const NAMED_REQUEST = new RegExp(
  `(start|begin|do|try|have|play|go with|ready for|up for|want|like)\\s+(?:the\\s+|a\\s+|that\\s+|it\\s+|to\\s+)*${SESSION_NOUN.source}`,
  "i"
);

const BARE_AFFIRMATION =
  /^\s*(yes|yeah|yep|yup|sure|ok|okay|alright|please|ready|i'?m ready|let'?s (?:do it|go|start|begin)|go ahead|do it|start|begin|sounds good|i'?d like (?:to|that)|why not|i'?m in)\b/i;

// Did a guided session come up in the last few turns? Bounds how long a bare
// "yes" stays attached to an earlier offer.
function sessionRecentlyDiscussed(messages, lookback = 6) {
  return (messages || [])
    .slice(-lookback)
    .some((m) => m && m.content && SESSION_NOUN.test(m.content));
}

function detectHypnoRequest(userText, messages) {
  const t = userText || "";
  if (NAMED_REQUEST.test(t)) return true;
  return BARE_AFFIRMATION.test(t) && sessionRecentlyDiscussed(messages);
}

module.exports = {
  detectCrisis,
  detectRatingRequest,
  detectTherapyMode,
  detectHypnoOffer,
  detectHypnoRequest,
};
