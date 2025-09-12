"use client";

// src/app/lib/audioBus.ts
export class TTSBus {
  private ctx!: AudioContext;
  private audio!: HTMLAudioElement;
  private src!: MediaElementAudioSourceNode;
  private analyser!: AnalyserNode;
  private gain!: GainNode;
  private ready = false;
  private speaking = false;

  async init() {
    if (this.ready) return;
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.crossOrigin = "anonymous";
    this.audio.playbackRate = 1.08;
    (this.audio as any).preservesPitch = true;
    (this.audio as any).mozPreservesPitch = true;
    (this.audio as any).webkitPreservesPitch = true;

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.src = this.ctx.createMediaElementSource(this.audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.06;
    this.analyser.minDecibels = -70;
    this.analyser.maxDecibels = -10;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1.0; // keep audible; set 0 for silent lip-sync

    // <audio> → analyser → gain → destination
    this.src.connect(this.analyser);
    this.analyser.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    const resume = () => this.ctx.resume?.().catch(() => {});
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });

    // speaking state tracking
    this.audio.onplay = () => { this.speaking = true; };
    this.audio.onended = () => { this.speaking = false; };
    this.audio.onpause = () => { this.speaking = false; };

    this.ready = true;
  }

  async speak(
    text: string,
    voiceId?: string,
    modelId?: string,
    opts?: { style?: number; stability?: number; similarityBoost?: number }
  ) {
    await this.init();
    if (!text) return;
    await this.speakStream(text, voiceId, modelId, opts);
  }

  getAnalyser() {
    return this.analyser || null;
  }

  isSpeaking() {
    return this.speaking;
  }

  setPlaybackRate(rate: number) {
    if (!this.audio) return;
    const r = Math.max(0.5, Math.min(2.0, rate));
    this.audio.playbackRate = r;
  }

  async speakStream(
    text: string,
    voiceId?: string,
    modelId?: string,
    opts?: { style?: number; stability?: number; similarityBoost?: number }
  ) {
    await this.init();
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId, modelId, style: opts?.style, stability: opts?.stability, similarityBoost: opts?.similarityBoost }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);

    const mseSupported = typeof window !== "undefined" && "MediaSource" in window && (window as any).MediaSource?.isTypeSupported?.("audio/mpeg");
    if (mseSupported && res.body) {
      const mediaSource = new MediaSource();
      const url = URL.createObjectURL(mediaSource);
      this.audio.src = url;

      await new Promise<void>((resolve, reject) => {
        mediaSource.addEventListener("sourceopen", async () => {
          let sb: SourceBuffer;
          try {
            sb = mediaSource.addSourceBuffer("audio/mpeg");
          } catch (e) {
            reject(e);
            return;
          }

          const reader = res.body!.getReader();
          let first = true;
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read();
            if (done) {
              try { mediaSource.endOfStream(); } catch {}
              resolve();
              return;
            }
            await new Promise<void>((r) => {
              const onEnd = () => { sb.removeEventListener("updateend", onEnd); r(); };
              sb.addEventListener("updateend", onEnd);
              try {
                sb.appendBuffer(value);
              } catch (e) {
                sb.removeEventListener("updateend", onEnd);
                reject(e as any);
              }
            });
            if (first) {
              first = false;
              // Start playback ASAP
              this.audio.play().catch(async () => {
                await this.ctx.resume().catch(() => {});
                await this.audio.play();
              });
            }
            await pump();
          };
          try {
            await pump();
          } catch (e) {
            reject(e as any);
            return;
          }
        }, { once: true });
      });
      return;
    }

    // Fallback: blob
    const blob = await res.blob();
    const url2 = URL.createObjectURL(blob);
    this.audio.src = url2;
    await this.audio.play().catch(async () => {
      await this.ctx.resume().catch(() => {});
      await this.audio.play();
    });
  }
}

export const ttsBus = new TTSBus();
