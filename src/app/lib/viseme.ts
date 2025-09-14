// Lightweight vowel viseme estimator for VRM lip-sync.
// Uses time-domain RMS for jaw openness + spectral bands for A/E/I/O/U mix.
// Includes latency buffer, noise gate, attack/decay smoothing, and coarticulation.

export type VisemeSettings = {
  gate: number;            // silence threshold (0..1 of RMS)
  sensitivity: number;     // multiplies RMS to mouth openness
  attack: number;          // 0..1 (lower = snappier)
  decay: number;           // 0..1 (lower = snappier)
  latencyMs: number;       // compensate audio → analyser lag
  bandA: [number, number]; // FFT bin range for "A"
  bandE: [number, number]; // "E"
  bandI: [number, number]; // "I"
  bandO: [number, number]; // "O"
  bandU: [number, number]; // "U"
  mixAEIOU: [number, number, number, number, number]; // optional per-vowel bias
};

export class VisemeEngine {
  private td = new Uint8Array(2048);
  private fd = new Uint8Array(1024);
  private buf: { rms:number; a:number; e:number; i:number; o:number; u:number }[] = [];
  private head = 0;
  private size = 256; // ~buffer frames
  private prev = { A:0, E:0, I:0, O:0, U:0, mouth:0 };

  constructor(private analyser: AnalyserNode, private settings: VisemeSettings) {
    this.buf = new Array(this.size).fill(null).map(()=>({rms:0,a:0,e:0,i:0,o:0,u:0}));
    this.analyser.smoothingTimeConstant = 0.015;
    try { this.analyser.fftSize = 1024; } catch {}
  }

  setAnalyser(a: AnalyserNode) { this.analyser = a; }

  // sample over provided bin index range (inclusive)
  private sampleBands(fd: Uint8Array, [lo, hi]: [number, number]) {
    const L = Math.max(0, Math.floor(lo));
    const H = Math.min(fd.length - 1, Math.ceil(hi));
    let s = 0; let n = 0;
    for (let k = L; k <= H; k++) { const v = (fd[k] - 128) / 128; s += v * v; n++; }
    return Math.sqrt(s / Math.max(1, n));
  }

  tick(dt: number) {
    if (!this.analyser) return this.prev;

    this.analyser.getByteTimeDomainData(this.td);
    this.analyser.getByteFrequencyData(this.fd);

    // RMS for openness
    let sum = 0;
    for (let i = 0; i < this.td.length; i++) { const v = (this.td[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / this.td.length);

    // Frequency bands → vowel cues (bin indices)
    const s = this.settings;
    const A = this.sampleBands(this.fd, s.bandA);
    const E = this.sampleBands(this.fd, s.bandE);
    const I = this.sampleBands(this.fd, s.bandI);
    const O = this.sampleBands(this.fd, s.bandO);
    const U = this.sampleBands(this.fd, s.bandU);

    // Normalize A/E/I/O/U mix with biases
    const bias = s.mixAEIOU || [1,1,1,1,1];
    const vA = A * (bias[0] ?? 1);
    const vE = E * (bias[1] ?? 1);
    const vI = I * (bias[2] ?? 1);
    const vO = O * (bias[3] ?? 1);
    const vU = U * (bias[4] ?? 1);

    const eps = 1e-6;
    const sumV = vA + vE + vI + vO + vU + eps;
    const pA = vA / sumV, pE = vE / sumV, pI = vI / sumV, pO = vO / sumV, pU = vU / sumV;

    // Noise gate + openness (snappier)
    const open = rms > s.gate ? Math.min(1, rms * s.sensitivity) : 0;

    // Push features into a ring buffer for latency compensation
    this.buf[this.head] = { rms: open, a: pA, e: pE, i: pI, o: pO, u: pU };
    this.head = (this.head + 1) % this.size;

    // Compute delayed index
    const frameMs = 1000 / 60; // assume ~60 FPS
    const delayFrames = Math.min(this.size - 1, Math.max(0, Math.round((s.latencyMs || 0) / frameMs)));
    let idx = this.head - 1 - delayFrames;
    while (idx < 0) idx += this.size;
    const f = this.buf[idx];

    // Attack/decay smoothing & coarticulation
    const att = s.attack, dec = s.decay;
    const smooth = (prev: number, next: number) => (next > prev)
      ? prev * att + next * (1 - att)
      : prev * dec + next * (1 - dec);

    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const mouth = clamp01(smooth(this.prev.mouth, f.rms));
    const A2 = clamp01(smooth(this.prev.A, f.a * mouth));
    const E2 = clamp01(smooth(this.prev.E, f.e * mouth));
    const I2 = clamp01(smooth(this.prev.I, f.i * mouth));
    const O2 = clamp01(smooth(this.prev.O, f.o * mouth));
    const U2 = clamp01(smooth(this.prev.U, f.u * mouth));

    this.prev = { A: A2, E: E2, I: I2, O: O2, U: U2, mouth };
    return this.prev;
  }
}

export const FAST_VISEME_DEFAULTS: VisemeSettings = {
  gate: 0.015,
  sensitivity: 12,
  attack: 0.18,
  decay: 0.30,
  latencyMs: 70,
  bandA: [1, 6],
  bandE: [6, 20],
  bandI: [20, 50],
  bandO: [5, 14],
  bandU: [12, 24],
  mixAEIOU: [1.1, 1.0, 1.1, 1.05, 1.05],
};
