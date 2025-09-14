import { env } from "./env";
import { SETSUNA_SYSTEM_PROMPT } from "../persona/setsuna";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export interface LLM {
  stream(messages: ChatMessage[], opts?: { temperature?: number; maxTokens?: number }): Promise<ReadableStream<Uint8Array>>;
}

function systemPrompt() {
  return SETSUNA_SYSTEM_PROMPT;
}

function buildMessages(history: any[], user: string): ChatMessage[] {
  const fewshot = [
    { role: "system" as const, content: systemPrompt() },
    { role: "user" as const, content: "hi" },
    { role: "assistant" as const, content: "Tch—bold of you to greet me first. What mischief are you up to tonight?" },
  ];
  const tail = (history || []).slice(-8).map((m: any) => ({ 
    role: m.role as "user" | "assistant", 
    content: m.content || m.text 
  }));
  return [...fewshot, ...tail, { role: "user" as const, content: user }];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class OpenAIProvider implements LLM {
  async stream(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<ReadableStream<Uint8Array>> {
    const body = JSON.stringify({
      model: env.OPENAI_MODEL,
      messages,
      temperature: opts.temperature || 0.9,
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

    const attemptWithRetries = async (): Promise<Response> => {
      const delays = [500, 1200, 2500];
      
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", { 
            method: "POST", 
            headers, 
            body 
          });
          
          // Don't retry on auth errors
          if (res.status === 401 || res.status === 403) {
            return res;
          }
          
          // Retry on 429 and 5xx
          if (res.status === 429 || res.status >= 500) {
            if (i < 2) {
              const retryAfter = res.headers.get("Retry-After");
              const delay = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 3000) : delays[i];
              console.log(`[openai] Retry ${i + 1}/3 after ${delay}ms (status: ${res.status})`);
              await sleep(delay);
              continue;
            }
          }
          
          return res;
        } catch (error) {
          if (i < 2) {
            console.log(`[openai] Retry ${i + 1}/3 after ${delays[i]}ms (error: ${error})`);
            await sleep(delays[i]);
            continue;
          }
          throw error;
        }
      }
      
      throw new Error("Max retries exceeded");
    };

    const res = await attemptWithRetries();

    // Handle auth errors
    if (res.status === 401 || res.status === 403) {
      console.log(`[openai] Auth error: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…I can't reach the archive—credentials mismatch." });
          send({ meta: { fallback: "auth" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Handle quota errors
    if (res.status === 429) {
      console.log(`[openai] Quota error after retries: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…cloud familiars sulking. Give me a moment and try again?" });
          send({ meta: { fallback: "quota" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Handle server errors
    if (!res.ok || !res.body) {
      console.log(`[openai] Server error after retries: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…the ether crackled. Let's try that again soon." });
          send({ meta: { fallback: "server" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Stream the response
    return new ReadableStream({
      start(controller) {
        const send = (obj: any) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let totalText = "";
        
        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buf += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            
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
          console.log(`[openai] Success: ${totalText.length} chars - "${preview}"`);
          
          send({ done: true });
          controller.close();
        };

        pump().catch(error => {
          console.log(`[openai] Network error: ${error}`);
          send({ delta: "…stormy silence. Try once more in a bit?" });
          send({ meta: { fallback: "network" } });
          send({ done: true });
          controller.close();
        });
      },
    });
  }
}

class GeminiProvider implements LLM {
  async stream(messages: ChatMessage[], opts: { temperature?: number; maxTokens?: number } = {}): Promise<ReadableStream<Uint8Array>> {
    const systemMsg = messages.find(m => m.role === "system");
    const chatMessages = messages.filter(m => m.role !== "system");
    
    const contents = chatMessages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    const body = JSON.stringify({
      systemInstruction: systemMsg ? { role: "user", parts: [{ text: systemMsg.content }] } : undefined,
      contents: systemMsg ? [{ role: "user", parts: [{ text: systemMsg.content }] }, ...contents] : contents,
      generationConfig: {
        temperature: opts.temperature || 0.9,
        topP: 0.95,
        maxOutputTokens: opts.maxTokens || 220
      }
    });

    const headers = {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GOOGLE_API_KEY
    };

    const attemptWithRetries = async (): Promise<Response> => {
      const delays = [500, 1200, 2500];
      
      for (let i = 0; i < 3; i++) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:streamGenerateContent?alt=sse`,
            { method: "POST", headers, body }
          );
          
          // Don't retry on auth errors
          if (res.status === 401 || res.status === 403) {
            return res;
          }
          
          // Retry on 429 and 5xx
          if (res.status === 429 || res.status >= 500) {
            if (i < 2) {
              const retryAfter = res.headers.get("Retry-After");
              const delay = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 3000) : delays[i];
              console.log(`[gemini] Retry ${i + 1}/3 after ${delay}ms (status: ${res.status})`);
              await sleep(delay);
              continue;
            }
          }
          
          return res;
        } catch (error) {
          if (i < 2) {
            console.log(`[gemini] Retry ${i + 1}/3 after ${delays[i]}ms (error: ${error})`);
            await sleep(delays[i]);
            continue;
          }
          throw error;
        }
      }
      
      throw new Error("Max retries exceeded");
    };

    const res = await attemptWithRetries();

    // Handle auth errors
    if (res.status === 401 || res.status === 403) {
      console.log(`[gemini] Auth error: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…I can't reach the archive—credentials mismatch." });
          send({ meta: { fallback: "auth" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Handle quota errors
    if (res.status === 429) {
      console.log(`[gemini] Quota error after retries: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…cloud familiars sulking. Give me a moment and try again?" });
          send({ meta: { fallback: "quota" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Handle server errors
    if (!res.ok || !res.body) {
      console.log(`[gemini] Server error after retries: ${res.status}`);
      return new ReadableStream({
        start(controller) {
          const send = (obj: any) =>
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));
          send({ delta: "…the ether crackled. Let's try that again soon." });
          send({ meta: { fallback: "server" } });
          send({ done: true });
          controller.close();
        },
      });
    }

    // Stream the response
    return new ReadableStream({
      start(controller) {
        const send = (obj: any) =>
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`));

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let totalText = "";
        
        const pump = async () => {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            buf += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") continue;
              
              try {
                const json = JSON.parse(payload);
                const candidates = json.candidates;
                if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
                  for (const part of candidates[0].content.parts) {
                    if (part.text) {
                      totalText += part.text;
                      send({ delta: part.text });
                    }
                  }
                }
              } catch (e) {
                // Ignore parse errors
              }
            }
          }
          
          // Log concise status and up to 80 chars of text
          const preview = totalText.length > 80 ? totalText.substring(0, 80) + "..." : totalText;
          console.log(`[gemini] Success: ${totalText.length} chars - "${preview}"`);
          
          send({ done: true });
          controller.close();
        };

        pump().catch(error => {
          console.log(`[gemini] Network error: ${error}`);
          send({ delta: "…stormy silence. Try once more in a bit?" });
          send({ meta: { fallback: "network" } });
          send({ done: true });
          controller.close();
        });
      },
    });
  }
}

export function getLLM(): LLM {
  return env.LLM_PROVIDER === "gemini" && env.GOOGLE_API_KEY ? new GeminiProvider() : new OpenAIProvider();
}

export function buildChatMessages(history: any[], user: string): ChatMessage[] {
  return buildMessages(history, user);
}
