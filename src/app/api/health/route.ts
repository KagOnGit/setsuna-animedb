import { env } from "../../lib/env";
export const runtime = "edge";
export async function GET() {
  const openaiOk = Boolean(env.OPENAI_API_KEY);
  const ttsOk = Boolean(env.ELEVENLABS_API_KEY);
  const projHint = env.OPENAI_API_KEY.startsWith("sk-proj-") && !env.OPENAI_PROJECT ? "missing_project" : "ok";
  
  return new Response(JSON.stringify({ 
    openai: openaiOk, 
    tts: ttsOk,
    project: projHint
  }), { 
    headers: { "Content-Type": "application/json" } 
  });
}