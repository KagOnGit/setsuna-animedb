export const runtime = "edge";
import { env } from "../../lib/env";
import { resolveVoiceId } from "../../lib/eleven";

export async function POST(req: Request) {
  try {
    if (!env.ELEVENLABS_API_KEY) return new Response("Missing ELEVENLABS_API_KEY", { status: 500 });
    
    const { text } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response("Missing text", { status: 400 });
    }

    // Resolve voice ID (supports voice name in env)
    let voiceId: string;
    try {
      voiceId = await resolveVoiceId(env.ELEVEN_VOICE_ID, env.ELEVENLABS_API_KEY);
    } catch (e: any) {
      try { console.error("Voice resolve error:", e?.message || String(e)); } catch {}
      return new Response("tts_voice_error", { status: 500 });
    }

    const MODEL = env.ELEVEN_MODEL_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=2&output_format=mp3_44100_128`;
    const body = {
      text,
      model_id: MODEL,
      voice_settings: {
        stability: 0.16,
        similarity_boost: 0.95,
        style: 0.90,
        use_speaker_boost: true,
      },
    };

    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok || !upstream.body) {
      try { console.error("ElevenLabs TTS error:", upstream.status); } catch {}
      return new Response("tts_error", { status: upstream.status || 500 });
    }
    return new Response(upstream.body, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (e) {
    try { console.error("TTS route error"); } catch {}
    return new Response("tts_route_error", { status: 500 });
  }
}
