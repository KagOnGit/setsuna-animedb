// Minimal ElevenLabs helpers for voice resolution (Edge-safe)

type VoiceInfo = { voice_id: string; name: string };

declare global {
  // eslint-disable-next-line no-var
  var __elevenVoiceCache: Record<string, string> | undefined;
}

const ID_RE = /^[0-9a-f-]{32,36}$/i;

export async function resolveVoiceId(envVoice: string, apiKey: string): Promise<string> {
  const trimmed = (envVoice || "").trim();
  if (!trimmed) throw new Error("Voice not set");
  if (ID_RE.test(trimmed)) return trimmed;

  // cache by lowercase name
  const key = trimmed.toLowerCase();
  globalThis.__elevenVoiceCache ||= {};
  if (globalThis.__elevenVoiceCache[key]) return globalThis.__elevenVoiceCache[key];

  const r = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  if (!r.ok) {
    // log concise server-side
    try { console.error("ElevenLabs voices error:", r.status); } catch {}
    throw new Error("Voice resolution failed");
  }
  const data = await r.json().catch(() => ({ voices: [] }));
  const voices: VoiceInfo[] = data?.voices || [];
  const found = voices.find((v) => (v.name || "").toLowerCase() === key);
  if (!found?.voice_id) {
    throw new Error(`Voice '${envVoice}' not found; set ELEVEN_VOICE_ID to a valid ID`);
  }
  globalThis.__elevenVoiceCache[key] = found.voice_id;
  return found.voice_id;
}

