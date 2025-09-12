export type IntentType = "add_anime" | "rate_anime" | "recommend" | "smalltalk" | "unknown";

export type ParsedIntent = {
  type: IntentType;
  params?: Record<string, string | number>;
};

export function parseIntent(input: string): ParsedIntent {
  const s = (input || "").trim().toLowerCase();

  // Casual/small messages or single emoji → smalltalk
  const casual = /^(hi|hey|hello|yo|sup|waddup|what'?s up|wyd|hru|how'?s it going|omg|lmao|lol|bruh|hmm|huh|idk|\?+|!+|…|uh+)$/i;
  const onlyEmoji = /^[\p{Emoji_Presentation}\p{Emoji}\u200d]+$/u;
  if (casual.test(s) || onlyEmoji.test(s) || s.length <= 4) return { type: "smalltalk" };

  if (/(add|track)\s+anime/.test(s)) return { type: "add_anime" };
  if (/(rate|score)\s+/.test(s)) return { type: "rate_anime" };
  if (/(recommend|suggest|what\s+should\s+i\s+watch)/.test(s)) return { type: "recommend" };

  return { type: "unknown" };
}
