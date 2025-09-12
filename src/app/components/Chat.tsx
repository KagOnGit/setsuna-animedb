"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "../lib/store";
// Intents/tools disabled for now; streaming LLM handles replies
import { ttsBus } from "../lib/audioBus";

export default function Chat({ onNeedMic, onEmotion }: { onNeedMic?: () => Promise<void> | void, onEmotion?: (e: {emotion: string; intensity: number}) => void }) {
  const { messages, addMessage, ttsEnabled, setTTSEnabled } = useStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [diag, setDiag] = useState<{ openai?: boolean; tts?: boolean; project?: string } | null>(null);
  const [hideDiag, setHideDiag] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [ctrl, setCtrl] = useState<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try { await ttsBus.init(); } catch {}
      (window as any).__getTTSAnalyser = () => ttsBus.getAnalyser();
      (window as any).__isTTSSpeaking = () => ttsBus.isSpeaking();
    })();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!mounted) return;
        if (r.ok) {
          const j = await r.json();
          setDiag(j);
        } else {
          setDiag({ openai: false, tts: false });
        }
      } catch {
        setDiag({ openai: false, tts: false });
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function say(text: string) {
    if (!ttsEnabled) return;
    const prepForTTS = (t: string) => t
      .replace(/\s+-\s+/g, ", ")
      .replace(/\b(uh|um)\b/gi, "…")
      .replace(/([^.!?])\s+([A-Z])/g, "$1. $2")
      .replace(/,{1}\s*/g, ", ");
    try {
      await ttsBus.speak(prepForTTS(text));
    } catch (e) {
      console.error(e);
      setErr("TTS unavailable. Check server logs.");
    }
  }

  const handleTestVoice = () => { void ttsBus.speak("Hmph… fine. I’ll say something—for testing."); };
  const send = () => { void handleSend(); };

  async function handleSend() {
    const t = text.trim();
    if (!t) return;
    // abort any in-flight stream
    try { ctrl?.abort(); } catch {}
    const controller = new AbortController();
    setCtrl(controller);
    try { (window as any).__pokeThinking?.(); } catch {}
    setText("");
    addMessage({ role: "user", text: t });
    setBusy(true);

    // streaming to /api/chat/stream
    const recent = [...messages, { id: crypto.randomUUID(), role: "user", text: t, ts: Date.now() }]
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.text }));

    const draftId = crypto.randomUUID();
    addMessage({ role: "assistant", text: "", id: draftId });
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t, history: recent }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        useStore.setState((s) => ({ messages: s.messages.map((m) => (m.id === draftId ? { ...m, text: "I can’t reach the Archive right now… mind trying again?" } : m)) }));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let finalText = "";
      let fallback = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const sline = line.trim();
          if (!sline || !sline.startsWith("data:")) continue;
          const payload = sline.slice(5).trim();
          try {
            const json = JSON.parse(payload);
            if (json.delta) {
              finalText += json.delta;
              useStore.setState((st) => ({ messages: st.messages.map((m) => (m.id === draftId ? { ...m, text: finalText } : m)) }));
            } else if (json.meta?.fallback) {
              fallback = true;
              const reason = json.meta?.reason || "fallback";
              if (reason === "auth") {
                setFallbackNote("OpenAI auth/project mismatch. If your key starts with sk-proj-, add OPENAI_PROJECT in .env and redeploy.");
              } else {
                setFallbackNote(`Cloud's moody tonight (fallback: ${reason}). I'll still tease you—what's your vibe?`);
              }
            } else if (json.done) {
              if (!fallback && ttsEnabled && finalText.trim()) await ttsBus.speak(finalText);
            }
          } catch {}
        }
      }
    } catch (e) {
      useStore.setState((s) => ({ messages: s.messages.map((m) => (m.id === draftId ? { ...m, text: "…connection dropped. Shall we try again?" } : m)) }));
    } finally {
      setBusy(false);
      setCtrl(null);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {process.env.NODE_ENV === "development" && !!diag && !hideDiag && (!diag.openai || !diag.tts) && (
        <div className="diagBanner">
          <span style={{ fontWeight: 600 }}>Diagnostics:</span>&nbsp;
          {diag?.openai ? "OpenAI ✅" : "OpenAI ❌"} · {diag?.tts ? "TTS ✅" : "TTS ❌"}
          {diag?.project === "missing_project" && " · Project ⚠️"}
          <button className="btn" onClick={() => setHideDiag(true)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}
      {fallbackNote && (
        <div className="diagBanner">
          {fallbackNote}
          <button className="btn" onClick={() => setFallbackNote(null)} style={{ marginLeft: 8 }}>Dismiss</button>
        </div>
      )}
      {busy && (
        <div className="diagBanner">typing…</div>
      )}
      <div className="chatScroll">
        {messages.map((m) => (
          <div className="message" key={m.id} style={{opacity: m.role === 'assistant' ? 0.9 : 1}}>
            <div className="role">{m.role}</div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>

      <div className="chatFooter">
        <div className="controlsRow">
          <div className="left">
            <button className="btn" onClick={() => onNeedMic?.()}>Enable Mic</button>
            <label style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="checkbox" checked={ttsEnabled} onChange={(e)=>setTTSEnabled(e.target.checked)} />
              Voice replies
            </label>
          </div>
          <div className="right">
            <button className="btn" onClick={handleTestVoice}>Test Voice</button>
          </div>
        </div>
        <div className="inputRow">
          <input className="input" placeholder={busy ? 'Searching AniList…' : 'Type a message'} value={text} onChange={(e)=>setText(e.target.value)} onKeyDown={handleKey} />
          <button className="btn" onClick={send} disabled={busy}>Send</button>
        </div>
        {err && (<div style={{ color: '#f88' }}>{err}</div>)}
      </div>
    </>
  );
}
