import { NextRequest } from "next/server";
import { env } from "../../../lib/env";

export const runtime = "edge";

function systemPrompt() {
  return `You are Setsuna, a tsundere vampire. Keep replies 1–3 sentences, playful, spoiler-safe, end with a teasing question.`;
}

function buildMessages(history: any[], user: string) {
  const fewshot = [
    { role: "system", content: systemPrompt() },
    { role: "user", content: "hi" },
    { role: "assistant", content: "Tch—bold of you to greet me first. What mischief are you up to tonight?" },
  ];
  const tail = (history || []).slice(-8);
  return [...fewshot, ...tail, { role: "user", content: user }];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function attemptWithRetries(fetchFn: () => Promise<Response>, maxRetries = 3) {
  const delays = [500, 1200, 2500];
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetchFn();
      
      // Don't retry on auth errors
      if (res.status === 401 || res.status === 403) {
        return res;
      }
      
      // Retry on 429 and 5xx
      if (res.status === 429 || res.status >= 500) {
        if (i < maxRetries - 1) {
          const retryAfter = res.headers.get("Retry-After");
          const delay = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 3000) : delays[i];
          console.log(`[stream] Retry ${i + 1}/${maxRetries} after ${delay}ms (status: ${res.status})`);
          await sleep(delay);
          continue;
        }
      }
      
      return res;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`[stream] Retry ${i + 1}/${maxRetries} after ${delays[i]}ms (error: ${error})`);
        await sleep(delays[i]);
        continue;
      }
      throw error;
    }
  }
  
  throw new Error("Max retries exceeded");
}

export async function POST(req: NextRequest) {
  const { message, history } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("bad_request", { status: 400 });
  }

  const body = JSON.stringify({
    model: env.OPENAI_MODEL,
    messages: buildMessages(history, message),
    temperature: 0.9,
    top_p: 0.95,
    presence_penalty: 0.6,
    frequency_penalty: 0.25,
    stream: true,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
  };
  if (env.OPENAI_PROJECT) headers["OpenAI-Project"] = env.OPENAI_PROJECT;

  // SSE response
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: any) =>
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const res = await attemptWithRetries(() => 
          fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers, body })
        );

        // Handle auth errors (don't retry these)
        if (res.status === 401 || res.status === 403) {
          console.log(`[stream] Auth error: ${res.status}`);
          send({ delta: "…I can't reach the archive—credentials mismatch." });
          send({ meta: { fallback: "auth" } });
          send({ done: true });
          controller.close();
          return;
        }

        // Handle quota errors (after retries)
        if (res.status === 429) {
          console.log(`[stream] Quota error after retries: ${res.status}`);
          send({ delta: "…cloud familiars sulking. Give me a moment and try again?" });
          send({ meta: { fallback: "quota" } });
          send({ done: true });
          controller.close();
          return;
        }

        // Handle server errors (after retries)
        if (!res.ok || !res.body) {
          console.log(`[stream] Server error after retries: ${res.status}`);
          send({ delta: "…the ether crackled. Let's try that again soon." });
          send({ meta: { fallback: "server" } });
          send({ done: true });
          controller.close();
          return;
        }

        // Stream the response
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let totalText = "";
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          buf += decoder.decode(value, { stream: true });
          
          // Process complete lines
          const lines = buf.split("\n");
          buf = lines.pop() || ""; // Keep incomplete line in buffer
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                totalText += delta;
                send({ delta });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
        
        // Log concise status and up to 80 chars of text
        const preview = totalText.length > 80 ? totalText.substring(0, 80) + "..." : totalText;
        console.log(`[stream] Success: ${totalText.length} chars - "${preview}"`);
        
        send({ done: true });
        controller.close();
        
      } catch (error) {
        console.log(`[stream] Network error: ${error}`);
        send({ delta: "…stormy silence. Try once more in a bit?" });
        send({ meta: { fallback: "network" } });
        send({ done: true });
        controller.close();
      }
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