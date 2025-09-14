export const runtime = "edge";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    const voiceId = env.ELEVEN_VOICE_ID;
    if (!text || !env.ELEVENLABS_API_KEY || !voiceId) {
      return new Response(JSON.stringify({ error: "tts_unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    }

    const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: "POST",
      headers: {
        accept: "audio/mpeg",
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: env.ELEVEN_MODEL_ID || "eleven_multilingual_v2",
        optimize_streaming_latency: 2,
        output_format: "mp3_44100_192",
        voice_settings: {
          stability: 0.12,
          similarity_boost: 0.99,
          style: 0.98,
          use_speaker_boost: true,
        },
      }),
    });

    const ct = upstream.headers.get("content-type") || "";
    if (upstream.ok && ct.includes("audio/mpeg")) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "cache-control": "no-store",
          "x-tts": "elevenlabs",
          "x-voice-id": String(voiceId).slice(-8),
        },
      });
    }

    let detail: any = null;
    try { detail = await upstream.json(); } catch {}
    const codeBase = detail?.detail?.status === "quota_exceeded" || detail?.status === "quota_exceeded" ? 402 : (upstream.status || 502);
    const code = codeBase === 401 ? 502 : codeBase;
    const body = JSON.stringify({ error: "tts_error", status: upstream.status, detail });
    return new Response(body, { status: code, headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "bad_request" }), { status: 400 });
  }
}
