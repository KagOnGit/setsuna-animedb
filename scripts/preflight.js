import dotenv from "dotenv";
dotenv.config();

const required = ["OPENAI_API_KEY", "ELEVENLABS_API_KEY"];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}
if (String(process.env.OPENAI_API_KEY || "").startsWith("sk-proj-") && !process.env.OPENAI_PROJECT) {
  console.warn("⚠️  OPENAI_API_KEY looks project-scoped (sk-proj-...) but OPENAI_PROJECT is not set. Set your Project ID to avoid quota/permission errors.");
}
console.log("Preflight OK");