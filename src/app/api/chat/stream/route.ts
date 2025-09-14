import { NextRequest } from "next/server";
import { getLLM, buildChatMessages } from "../../../lib/llm";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { message, history } = await req.json();
  if (!message || typeof message !== "string") {
    return new Response("bad_request", { status: 400 });
  }

  const messages = buildChatMessages(history, message);
  const llm = getLLM();

  try {
    const stream = await llm.stream(messages, { temperature: 0.9 });
    
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.log(`[stream] Error: ${error}`);
    
    const fallbackStream = new ReadableStream({
      start(controller) {
        const send = (obj: any) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ delta: "…stormy silence. Try once more in a bit?" });
        send({ meta: { fallback: "network" } });
        send({ done: true });
        controller.close();
      },
    });

    return new Response(fallbackStream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}