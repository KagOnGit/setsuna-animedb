export const runtime = "edge";

export async function GET() {
  const base = new URL(
    "/api/health/openai",
    process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  );
  const openaiUrl = base.toString();
  const ttsUrl = new URL("/api/health/tts", base).toString();

  const [o, t] = await Promise.allSettled([
    fetch(openaiUrl, { cache: "no-store" }),
    fetch(ttsUrl, { cache: "no-store" }),
  ]);

  const openai = o.status === "fulfilled" && o.value.ok;
  const tts = t.status === "fulfilled" && t.value.ok;

  return new Response(JSON.stringify({ openai, tts }), {
    headers: { "content-type": "application/json" },
  });
}

