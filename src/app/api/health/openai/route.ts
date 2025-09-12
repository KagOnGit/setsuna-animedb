import { env } from "../../../lib/env";
export const runtime = "edge";
export async function GET() {
  const ok = Boolean(env.OPENAI_API_KEY);
  const projHint = env.OPENAI_API_KEY.startsWith("sk-proj-") && !env.OPENAI_PROJECT ? "missing_project" : "ok";
  return new Response(JSON.stringify({ ok, project: projHint }), { headers: { "Content-Type": "application/json" } });
}