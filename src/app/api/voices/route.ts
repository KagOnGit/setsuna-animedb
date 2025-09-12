import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(_req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return new NextResponse("Missing ELEVENLABS_API_KEY", { status: 500 });

  const r = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": key },
    cache: "no-store",
  });

  if (!r.ok) {
    const txt = await r.text();
    return new NextResponse(txt, { status: r.status });
  }

  const { voices } = await r.json();
  const minimal = (voices || []).map((v: any) => ({ id: v.voice_id, name: v.name }));
  return NextResponse.json(minimal, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}

