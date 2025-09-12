// src/app/lib/env.ts
const isProd = process.env.NODE_ENV === "production";

function req(name: string): string {
  const v = process.env[name];
  const looksPlaceholder = v && v.startsWith("YOUR_");
  if (!v || v.trim() === "" || looksPlaceholder) {
    if (!isProd) {
      throw new Error(`Missing required env: ${name}. Add it to .env.local`);
    }
  }
  return v || "";
}

export const env = {
  OPENAI_API_KEY: req("OPENAI_API_KEY"),
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
  OPENAI_PROJECT: process.env.OPENAI_PROJECT || "",
  ELEVENLABS_API_KEY: req("ELEVENLABS_API_KEY"),
  ELEVEN_MODEL_ID: process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2",
  ELEVEN_VOICE_ID: process.env.ELEVEN_VOICE_ID || "Serafina", // locked default
};
