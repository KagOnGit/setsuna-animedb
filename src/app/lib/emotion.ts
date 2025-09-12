export type Emotion = "neutral"|"happy"|"smug"|"confused"|"sad"|"excited";

export function classifyEmotion(text: string): { emotion: Emotion; intensity: number } {
  const t = (text || "").toLowerCase();
  const hit = (re: RegExp) => re.test(t);
  if (hit(/[!?]{2,}|\bso\s+(cool|hype|exciting)\b/)) return { emotion: "excited", intensity: 0.7 };
  if (hit(/\b(hmm+|uh+|um+)\b|\?\s*$/)) return { emotion: "confused", intensity: 0.5 };
  if (hit(/\b(smug|heh|teehee|eh\?)/)) return { emotion: "smug", intensity: 0.5 };
  if (hit(/\b(aww+|sigh|melancholy|sad)\b|:’\)/)) return { emotion: "sad", intensity: 0.5 };
  if (hit(/\b(nice|yay|love|cute|good)\b|\:\)/)) return { emotion: "happy", intensity: 0.5 };
  return { emotion: "neutral", intensity: 0.3 };
}

