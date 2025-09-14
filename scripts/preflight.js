import dotenv from "dotenv";
dotenv.config();

const lifecycle = process.env.npm_lifecycle_event || "";
const isDevScript = lifecycle === "dev";
const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();

// Require LLM key matching provider
const required = [];
if (provider === "openai") required.push("OPENAI_API_KEY");
if (provider === "gemini") required.push("GOOGLE_API_KEY");

// ElevenLabs key is now required in all environments (no browser fallback)
required.push("ELEVENLABS_API_KEY");

const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}
if (String(process.env.OPENAI_API_KEY || "").startsWith("sk-proj-") && !process.env.OPENAI_PROJECT) {
  console.warn("⚠️  OPENAI_API_KEY looks project-scoped (sk-proj-...) but OPENAI_PROJECT is not set. Set your Project ID to avoid quota/permission errors.");
}
console.log("Preflight OK");
