export const env = (() => {
  const e = {
    LLM_PROVIDER: process.env.LLM_PROVIDER || "openai",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o-mini",
    OPENAI_PROJECT: process.env.OPENAI_PROJECT || "",
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || "",
    GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || "",
    ELEVEN_MODEL_ID: process.env.ELEVEN_MODEL_ID || "eleven_multilingual_v2",
    ELEVEN_VOICE_ID: process.env.ELEVEN_VOICE_ID || "Serafina",
    NODE_ENV: process.env.NODE_ENV || "development",
    // preview-only use (public): optional bypass token for protected previews
    NEXT_PUBLIC_VERCEL_BYPASS: process.env.NEXT_PUBLIC_VERCEL_BYPASS || "",
  };
  const isDev = e.NODE_ENV !== "production";

  const missing: string[] = [];
  if (e.LLM_PROVIDER === "openai" && !e.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (e.LLM_PROVIDER === "gemini" && !e.GOOGLE_API_KEY) missing.push("GOOGLE_API_KEY");
  if (!e.ELEVENLABS_API_KEY) missing.push("ELEVENLABS_API_KEY");

  // Warn if project-scoped key is used without OPENAI_PROJECT
  const isProjKey = e.OPENAI_API_KEY.startsWith("sk-proj-");
  if (isProjKey && !e.OPENAI_PROJECT) {
    console.warn("[env] OPENAI_API_KEY is project-scoped but OPENAI_PROJECT is not set.");
  }

  if (isDev && missing.length) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
  return e;
})();
