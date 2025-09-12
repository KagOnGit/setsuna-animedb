import { env } from "../../../lib/env";
export const runtime = "edge";
export async function GET() {
  const ok = Boolean(env.ELEVENLABS_API_KEY);
  return new Response(JSON.stringify({ ok }), { headers: { "Content-Type": "application/json" } });
}