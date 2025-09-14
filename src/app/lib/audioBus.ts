let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
const queue: Array<Blob> = [];
let speaking = false;
let playbackRate = 1.15;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    // Load saved rate if present (browser-only)
    try {
      const saved = Number(localStorage.getItem("setsuna.speechRate"));
      if (saved) playbackRate = Math.min(1.25, Math.max(0.95, saved));
    } catch {}
    try {
      (audio as any).preservesPitch = true;
      (audio as any).mozPreservesPitch = true;
      (audio as any).webkitPreservesPitch = true;
    } catch {}
    // Set rate only after metadata to avoid odd ends on some browsers
    audio.addEventListener("loadedmetadata", () => {
      audio!.playbackRate = playbackRate;
    });
    audio.addEventListener("ended", () => {
      speaking = false;
      URL.revokeObjectURL(currentUrl || "");
      currentUrl = null;
      // play next
      void dequeueAndPlay();
    });
  }
  return audio;
}

export function setPlaybackRate(rate: number) {
  const r = Math.min(1.25, Math.max(0.95, Number(rate) || 1.15));
  playbackRate = r;
  try { localStorage.setItem("setsuna.speechRate", String(r)); } catch {}
  if (audio && audio.readyState >= 1) audio.playbackRate = r;
}

async function dequeueAndPlay() {
  if (speaking || queue.length === 0) return;
  const a = ensureAudio();
  const blob = queue.shift()!;
  const url = URL.createObjectURL(blob);
  currentUrl = url;
  a.src = url;
  speaking = true;
  try { await a.play(); } catch (e) { speaking = false; throw e; }
}

export function isSpeaking() { return speaking; }
export function getAnalyser() { return null as unknown as AnalyserNode | null; }

async function fetchTTS(text: string): Promise<Response> {
  const r1 = await fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (r1.ok && r1.headers.get("content-type")?.includes("audio/")) return r1;
  if (r1.status === 401) {
    const e: any = new Error("protected");
    e.code = "tts_protected";
    throw e;
  }
  let shouldFallback = false;
  if ([402, 429, 500, 502, 503, 504].includes(r1.status)) shouldFallback = true;
  else {
    try {
      const j = await r1.clone().json();
      if (j?.detail?.detail?.status === "quota_exceeded" || j?.detail?.status === "quota_exceeded") {
        shouldFallback = true;
      }
    } catch {}
  }
  if (!shouldFallback) {
    const e: any = new Error("unavailable");
    e.code = "tts_unavailable";
    throw e;
  }
  const r2 = await fetch("/api/tts/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (r2.ok && r2.headers.get("content-type")?.includes("audio/")) return r2;
  const e: any = new Error("unavailable");
  e.code = (r2.status === 401) ? "tts_protected" : "tts_unavailable";
  throw e;
}

export async function speak(text: string) {
  if (!text || !text.trim()) return;
  const res = await fetchTTS(text);
  const engine = res.headers.get("x-tts") || "unknown";
  const id = res.headers.get("x-voice-id") || "";
  try { console.info(`[TTS] ${engine}`, id.slice(-12)); } catch {}
  const buf = await res.arrayBuffer();
  const blob = new Blob([buf], { type: "audio/mpeg" });
  queue.push(blob);
  await dequeueAndPlay();
}
