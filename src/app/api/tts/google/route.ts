export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import textToSpeech from "@google-cloud/text-to-speech";
import fs from "node:fs";

const isDev = process.env.NODE_ENV !== "production";

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToSetsunaSSML(raw: string, ratePct = 115, pitchSt = 2) {
  let t = raw;
  t = t.replace(/\s+/g, " ").trim();
  t = t.replace(/\b([A-Za-z])-(?=[A-Za-z])/g, (_m, p1: string) => {
    return `<say-as interpret-as="characters">${p1}</say-as>-`;
  });
  t = t
    .replace(/\.{3,}/g, `<break time="320ms"/>`)
    .replace(/—/g, `<break time="220ms"/>`);
  t = t.replace(/(!|\?\!)/g, `<break time="140ms"/><emphasis level="moderate">$1</emphasis>`);
  const safe = escapeXml(t);
  return `\n<speak>\n  <prosody rate="${ratePct}%" pitch="${pitchSt}st">\n    ${safe}\n  </prosody>\n</speak>`;
}

function jsonEnv<T = any>(key: string): T | null {
  const v = process.env[key];
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}
function jsonEnvB64<T = any>(key: string): T | null {
  const v = process.env[key];
  if (!v) return null;
  try { return JSON.parse(Buffer.from(v, 'base64').toString('utf-8')); } catch { return null; }
}
function fileJson<T = any>(p?: string): T | null {
  if (!p) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "bad_request" }), { status: 400 });
    }

    const creds =
      jsonEnv<any>("GOOGLE_APPLICATION_CREDENTIALS_JSON") ||
      jsonEnvB64<any>("GOOGLE_APPLICATION_CREDENTIALS_B64") ||
      fileJson<any>(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const envProject = process.env.GOOGLE_TTS_PROJECT_ID || creds?.project_id;

    let client: textToSpeech.TextToSpeechClient;
    if (creds && envProject) {
      client = new textToSpeech.TextToSpeechClient({ projectId: envProject, credentials: creds });
    } else if (isDev) {
      // Allow ADC in development for easy local testing
      client = new textToSpeech.TextToSpeechClient();
    } else {
      return new Response(JSON.stringify({ error: "tts_unavailable", reason: "missing_google_creds" }), { status: 503 });
    }

    const voiceName = process.env.GOOGLE_TTS_VOICE || "en-GB-Neural2-F";
    const audioEncoding = (process.env.GOOGLE_TTS_AUDIO_ENCODING || "MP3") as any;
    const speakingRate = Number(process.env.GOOGLE_TTS_SPEAKING_RATE || 1.15);
    const pitch = Number(String(process.env.GOOGLE_TTS_PITCH_ST || "2").replace(/[^\d\.\-]/g, ""));

    const ssml = textToSetsunaSSML(text, Math.round(speakingRate * 100), pitch);

    const [res] = await client.synthesizeSpeech({
      input: { ssml },
      voice: { languageCode: "en-GB", name: voiceName },
      audioConfig: {
        audioEncoding,
        speakingRate,
        pitch,
        effectsProfileId: ["small-bluetooth-speaker-class-device"],
      },
    });

    const bytes = res.audioContent as Uint8Array | string | undefined;
    if (!bytes) {
      return new Response(JSON.stringify({ error: "tts_error" }), { status: 502 });
    }
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes as any);
    return new Response(buf, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-tts": "google",
        "x-voice-id": voiceName,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "tts_error", message: err?.message }), { status: 502 });
  }
}
