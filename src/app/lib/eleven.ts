// ElevenLabs voice resolution with robust caching (Edge-safe)

type VoiceInfo = { voice_id: string; name: string };

declare global {
  // eslint-disable-next-line no-var
  var __EL_VOICE_CACHE: Record<string, string> | undefined;
}

export async function resolveVoiceId(envVoice: string, apiKey: string): Promise<string> {
  const trimmed = (envVoice || "").trim();
  if (!trimmed) throw new Error("Voice not set");
  
  // If envVoice looks like an ID (>= 20 chars, alnum, dashes/underscores), return it
  if (trimmed.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return trimmed;
  }

  // Cache in globalThis.__EL_VOICE_CACHE to avoid repeated calls
  const key = trimmed.toLowerCase();
  (globalThis as any).__EL_VOICE_CACHE ||= {};
  if ((globalThis as any).__EL_VOICE_CACHE[key]) {
    return (globalThis as any).__EL_VOICE_CACHE[key];
  }

  // Fetch GET /v1/voices with header 'xi-api-key'
  const r = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: { "xi-api-key": apiKey },
    cache: "no-store",
  });
  
  if (!r.ok) {
    console.error("ElevenLabs voices error:", r.status);
    throw new Error("Voice resolution failed");
  }
  
  const data = await r.json().catch(() => ({ voices: [] }));
  const voices: VoiceInfo[] = data?.voices || [];
  
  // Find case-insensitive name match and return .voice_id
  const found = voices.find((v) => (v.name || "").toLowerCase() === key);
  if (!found?.voice_id) {
    throw new Error(`Voice '${envVoice}' not found; set ELEVEN_VOICE_ID to a valid ID`);
  }
  
  // Cache the result
  (globalThis as any).__EL_VOICE_CACHE[key] = found.voice_id;
  return found.voice_id;
}

