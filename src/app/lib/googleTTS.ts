import textToSpeech from "@google-cloud/text-to-speech";
import { toGoogleSSML } from "./ttsProsodyGoogle";

// Read env directly to avoid changing existing env module logic
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE || "en-GB-Neural2-F";
const GOOGLE_TTS_AUDIO_ENCODING = process.env.GOOGLE_TTS_AUDIO_ENCODING || "MP3";
const GOOGLE_TTS_SPEAKING_RATE = Number(process.env.GOOGLE_TTS_SPEAKING_RATE ?? "1.1");
const GOOGLE_TTS_PITCH_ST = String(process.env.GOOGLE_TTS_PITCH_ST ?? "+2.0");
const GOOGLE_APPLICATION_CREDENTIALS_JSON = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || "";
const GOOGLE_TTS_PROJECT_ID = process.env.GOOGLE_TTS_PROJECT_ID || "";

let _client: any = null;

function getGoogleClient() {
  if (_client) return _client;
  const credsRaw = GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const creds = credsRaw ? JSON.parse(credsRaw) : undefined;
  _client = new textToSpeech.TextToSpeechClient({
    projectId: GOOGLE_TTS_PROJECT_ID || creds?.project_id,
    credentials: creds ? { client_email: creds.client_email, private_key: creds.private_key } : undefined,
  });
  return _client;
}

export async function googleSynthesize(text: string): Promise<Uint8Array> {
  const client = getGoogleClient();
  const ssml = toGoogleSSML(text)({ rate: GOOGLE_TTS_SPEAKING_RATE, pitchSt: GOOGLE_TTS_PITCH_ST });

  const [resp] = await client.synthesizeSpeech({
    input: { ssml },
    voice: { languageCode: GOOGLE_TTS_VOICE.startsWith("en-GB") ? "en-GB" : "en-US", name: GOOGLE_TTS_VOICE },
    audioConfig: { audioEncoding: (GOOGLE_TTS_AUDIO_ENCODING as any) || "MP3" },
  });

  const b64 = resp.audioContent as string;
  if (!b64) throw new Error("google_tts_empty_audio");
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
