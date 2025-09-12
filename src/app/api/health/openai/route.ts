export const runtime = "edge";
import { env } from "@/lib/env";

export async function GET() {
  if (!env.OPENAI_API_KEY) return new Response(JSON.stringify({ ok: false }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
}
