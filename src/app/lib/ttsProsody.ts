/**
 * Clean/shape text for ElevenLabs TTS to avoid cutoffs and improve clarity.
 * - Ellipses ("..." / "…") -> spaced em-dash " — " (reliable pause, no truncation).
 * - Interjections like "Very well." "Well." "Alright." joined to next sentence with " — ".
 * - Stutters "B-baka" -> "B… baka" so the leading letter is spoken clearly.
 * - Collapse weird whitespace and control chars; keep punctuation otherwise.
 */
export function cleanTextForTTS(input: string): string {
  if (!input) return "";
  let s = input;

  // Strip control chars (keep standard whitespace)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");

  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Ellipses -> em-dash pause
  s = s.replace(/\.{3,}|…/g, " — ");
  s = s.replace(/(\s*—\s*){2,}/g, " — ");
  s = s.replace(/\s*—\s*/g, " — ");

  // Join very short interjections to the next sentence (prevents early stop)
  // e.g., "Very well. I was ..." -> "Very well — I was ..."
  const INTERJ = "(?:Very well|Well|Alright|Fine|Hmph|Ahem|Anyway|Very good|Very well then)";
  s = s.replace(new RegExp(`\\b(${INTERJ})\\.(\\s+)([A-Z])`, "g"), "$1 — $3");

  // Letter stutters "B-baka", "N-no" -> "B… baka", "N… no"
  s = s.replace(/\b([A-Za-z])-(?=[A-Za-z])/g, "$1… ");

  // Light punctuation tidy
  s = s.replace(/([!?]){2,}/g, "$1");

  // Defensive max length (do not split)
  if (s.length > 4800) s = s.slice(0, 4800);

  return s;
}

