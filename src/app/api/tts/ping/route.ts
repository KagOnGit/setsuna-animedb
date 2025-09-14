// src/app/api/tts/ping/route.ts
export const runtime = "edge";
export function GET() {
  return new Response(null, { status: 204 });
}

