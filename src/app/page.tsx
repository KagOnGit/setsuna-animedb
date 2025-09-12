"use client";

import Avatar from "./components/Avatar";
import Chat from "./components/Chat";
import { useEffect, useState } from "react";

export default function Page() {
  const [ttsAnalyser, setTtsAnalyser] = useState<AnalyserNode | null>(null);
  const [useMic, setUseMic] = useState(false);
  const [emotion, setEmotion] = useState<{emotion: string; intensity: number} | undefined>(undefined);

  useEffect(() => {
    // obtain analyser from audio bus once mounted
    (async () => {
      const fn = (window as any).__getTTSAnalyser;
      if (typeof fn === "function") {
        const ana = await fn();
        if (ana) setTtsAnalyser(ana);
      }
    })();
  }, []);

  const handleNeedMic = async () => {
    try {
      const start = (window as any).__startMic;
      if (typeof start === "function") await start();
      setUseMic(true);
    } catch (e) {
      console.error("Mic init failed:", e);
      alert("Microphone permission denied or not available.");
    }
  };

  return (
    <main className="app">
      {/* Left: Avatar */}
      <section className="avatarPane">
        <div className="avatarCanvas">
          {/* overlay buttons */}
          <div className="avatarOverlay">
            <button className="btn" onClick={handleNeedMic}>Enable Mic</button>
            <button className="btn" onClick={() => (window as any).__toggleTuner?.() || (window as any).__showTuner?.()}>Tuner (V)</button>
          </div>
          {/* Avatar renders into this container and resizes */}
          <Avatar ttsAnalyser={ttsAnalyser} useMic={useMic} emotion={emotion} />
        </div>
      </section>

      {/* Right: Chat */}
      <aside className="chatPane">
        <Chat onNeedMic={handleNeedMic} onEmotion={setEmotion} />
      </aside>
    </main>
  );
}
