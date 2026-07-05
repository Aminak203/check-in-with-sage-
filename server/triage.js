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
  "tap",
  "tapping",
  "eft ",
  "karate chop",
  "collarbone",
  "top of head",
  "eyebrow point",
  "breathing exercise",
  "breathe in",
  "breathe out",
  "inhale",
  "exhale",
  "relax your",
  "progressive muscle",
  "safe place",
  "visualize",
  "imagine a",
  "close your eyes",
  "4-7-8",
  "hypnotherapy",
  "tapping session",
  "tapping point",
  "reminder phrase",
];

function detectTherapyMode(text) {
  const lower = text.toLowerCase();
  return therapyKeywords.some((keyword) => lower.includes(keyword));
}

module.exports = { detectCrisis, detectRatingRequest, detectTherapyMode };
