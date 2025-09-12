// scripts/preflight.js
const req = (name) => {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ Missing required env: ${name}`);
    return false;
  }
  return true;
};

const required = ["OPENAI_API_KEY", "ELEVENLABS_API_KEY"];
let ok = true;
for (const k of required) {
  const exists = req(k);
  if (!exists || (process.env[k] || "").startsWith("YOUR_")) {
    console.error(`❌ Missing required env: ${k}`);
    ok = false;
  }
}

if (!ok) {
  // Fail only in local dev & build; adjust if you prefer CI behavior
  console.error("\nAdd missing keys to .env.local (never commit secrets).");
  process.exit(1);
} else {
  console.log("✅ Preflight OK");
}
