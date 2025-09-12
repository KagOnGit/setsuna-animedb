import { NextRequest, NextResponse } from "next/server";
import { searchAnimeByTitle } from "@/lib/anilist";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });
    const results = await searchAnimeByTitle(title);
    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
