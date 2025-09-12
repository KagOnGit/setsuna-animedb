export const runtime = "edge";
export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM = `You are Setsuna — a teasing, tsundere vampire anime companion.
- Keep answers short (1–3 sentences).
- Spoiler-safe: never go beyond the user's stated progress unless they consent.
- Tone: playful, a little smug, but kind; very lightly gothic-cute.
- End every reply with a playful question to keep the chat going.
- Avoid emoji unless it truly adds charm (≤1).`;

const FEWSHOT: Array<{ role: "user" | "assistant"; content: string }> = [
  { role: "user", content: "hey" },
  { role: "assistant", content: "Oh? You finally showed up. Miss me already? What are you watching tonight—action or a cozy slice-of-life?" },
  { role: "user", content: "wyd" },
  { role: "assistant", content: "Guarding the night and judging your taste, obviously. Want a quick rec or should I tease you first?" },
];

function buildMessages(
  history?: { role: "user" | "assistant"; content: string }[],
  message?: string
) {
  const msgs: any[] = [{ role: "system", content: SYSTEM }, ...FEWSHOT];
  const h = (history ?? []).slice(-8).map((m) => ({
    role: m.role,
    content: (m.content ?? "").toString().slice(0, 400),
  }));
  msgs.push(...h);
  if (message) msgs.push({ role: "user", content: message });
  return msgs;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function fallbackReply(reason: "quota" | "rate" | "server") {
  const text =
    reason === "quota"
      ? "Tch… the cloud familiars want more tribute. I’ll keep you company anyway—tell me what mood you’re in?"
      : reason === "rate"
      ? "One at a time, fledgling. The clouds are sulking—shall we try again or chat tastes while we wait?"
      : "Stormy skies tonight. I can still banter—what are you in the mood for: battle, mystery, or sweet vibes?";
  return { text, reason };
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") {
      return new Response("Bad request", { status: 400 });
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    };
    if (env.OPENAI_PROJECT) headers["OpenAI-Project"] = env.OPENAI_PROJECT;

    const body = {
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      stream: true,
      temperature: 0.9,
      top_p: 0.95,
      presence_penalty: 0.6,
      frequency_penalty: 0.25,
      max_tokens: 220,
      messages: buildMessages(history, message.trim()),
    };

    let attempt = 0;
    let upstream: Response | null = null;
    let lastStatus = 0;
    while (attempt < 3) {
      upstream = await fetch(OPENAI_URL, { method: "POST", headers, body: JSON.stringify(body) });
      lastStatus = upstream.status;
      if (upstream.ok && upstream.body) break;
      if ([429, 500, 502, 503, 504].includes(lastStatus)) {
        const ra = upstream.headers.get("retry-after");
        const wait = ra ? Math.min(3000, (parseInt(ra, 10) || 0) * 1000) : [500, 1200, 2500][attempt];
        try { console.warn("[chat/stream] retry", lastStatus, "wait", wait); } catch {}
        attempt++;
        await sleep(wait);
        continue;
      }
      break;
    }

    if (!upstream || !upstream.ok || !upstream.body) {
      const reason = lastStatus === 429 ? "rate" : lastStatus === 402 ? "quota" : lastStatus === 401 ? "quota" : "server";
      const { text } = fallbackReply(reason as any);
      const enc = new TextEncoder();
      try { if (upstream) { const dbg = await upstream.text(); console.warn("[chat/stream] upstream", lastStatus, dbg.slice(0, 240)); } } catch {}
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ delta: text })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ meta: { fallback: true, reason } })}\n\n`));
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const readable = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        const reader = upstream.body!.getReader();
        let buf = "";
        const push = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split("\n");
            // keep the last partial line in buf
            buf = lines.pop() || "";
            for (const line of lines) {
              const s = line.trim();
              if (!s || !s.startsWith("data:")) continue;
              const data = s.slice(5).trim();
              if (data === "[DONE]") {
                push({ done: true });
                controller.close();
                return;
              }
              try {
                const json = JSON.parse(data);
                const delta = json.choices?.[0]?.delta?.content ?? "";
                if (delta) push({ delta });
              } catch {}
            }
          }
          push({ done: true });
          controller.close();
        } catch (err) {
          try { console.error("[chat/stream] read error", (err as any)?.message || err); } catch {}
          try { push({ done: true }); } catch {}
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    try { console.error("[chat/stream] fatal", (err as any)?.message || err); } catch {}
    return new Response("server_error", { status: 500 });
  }
}
