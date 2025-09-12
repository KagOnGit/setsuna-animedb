"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils, VRMExpressionPresetName } from "@pixiv/three-vrm";
import { VisemeEngine, FAST_VISEME_DEFAULTS, VisemeSettings } from "@/lib/viseme";
import { useStore } from "@/lib/store";
import { ttsBus } from "@/lib/audioBus";

type Props = {
  ttsAnalyser?: AnalyserNode | null;
  useMic?: boolean;
  emotion?: { emotion: string; intensity: number } | undefined;
};

export default function Avatar({ ttsAnalyser, useMic, emotion }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { avatarLoaded, setAvatarLoaded } = useStore();
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const visemeRef = useRef<VisemeEngine | null>(null);
  const lastAnalyserRef = useRef<AnalyserNode | null>(null);
  const presetRef = useRef<{A:string;E:string;I:string;O:string;U:string}>({A:"A",E:"E",I:"I",O:"O",U:"U"});

  let VISEME_SETTINGS: VisemeSettings = { ...FAST_VISEME_DEFAULTS };

  function setExpr(vrm: VRM, name: string, val: number) {
    if (!vrm?.expressionManager) return;
    const x = Math.max(0, Math.min(1, val));
    vrm.expressionManager.setValue(name, x);
    try { (vrm.expressionManager as any).update?.(vrm); } catch {}
  }

  function resolvePreset(_vrmAny: any) {
    const EM: any = (VRMExpressionPresetName as any);
    return {
      A: EM?.A ?? EM?.Aa ?? "A",
      E: EM?.E ?? EM?.A ?? "E",
      I: EM?.I ?? EM?.A ?? "I",
      O: EM?.O ?? EM?.A ?? "O",
      U: EM?.U ?? EM?.A ?? "U",
    } as const;
  }

  useEffect(() => {
    // Load saved viseme tuning if present (do not show panel by default)
    try {
      const saved = localStorage.getItem('setsuna.viseme');
      if (saved) Object.assign(VISEME_SETTINGS, JSON.parse(saved));
    } catch {}

    // Viseme Tuner overlay (hidden by default, toggle with 'V', draggable, non-blocking when hidden)
    let panel: HTMLDivElement | null = null;
    let panelVisible = false;

    function buildPanel(s: any) {
      if (panel) return panel;
      panel = document.createElement('div');
      panel.className = 'visemePanel hidden';
      panel.innerHTML = `
        <div class="drag header">
          <b>Viseme Tuner</b>
          <button id="vt-close" style="margin-left:auto;background:#223;padding:2px 6px;border-radius:6px">Hide</button>
        </div>
        <label>latency <input id="vt-lat" type="range" min="0" max="240" step="10"></label>
        <label>gate <input id="vt-gate" type="range" min="0" max="0.06" step="0.005"></label>
        <label>sens <input id="vt-sens" type="range" min="4" max="16" step="1"></label>
      `;
      document.body.appendChild(panel);

      // init values
      (panel.querySelector('#vt-lat') as HTMLInputElement).value = String(s.latencyMs);
      (panel.querySelector('#vt-gate') as HTMLInputElement).value = String(s.gate);
      (panel.querySelector('#vt-sens') as HTMLInputElement).value = String(s.sensitivity);

      const save = () => { try { localStorage.setItem('setsuna.viseme', JSON.stringify(s)); } catch {} };
      const bind = (sel: string, key: keyof typeof s) => {
        const el = panel!.querySelector(sel) as HTMLInputElement;
        el.oninput = () => { (s as any)[key] = parseFloat(el.value); save(); };
      };
      bind('#vt-lat', 'latencyMs');
      bind('#vt-gate', 'gate');
      bind('#vt-sens', 'sensitivity');

      // draggable
      let dx=0, dy=0, dragging=false;
      const header = panel.querySelector('.drag') as HTMLElement;
      header.onmousedown = (e)=>{
        dragging=true; dx=e.clientX - panel!.offsetLeft; dy=e.clientY - panel!.offsetTop;
        document.onmousemove = (ev)=>{ if(!dragging) return; panel!.style.left = (ev.clientX-dx)+'px'; panel!.style.top = (ev.clientY-dy)+'px'; panel!.style.right='auto'; panel!.style.bottom='auto'; };
        document.onmouseup = ()=>{ dragging=false; document.onmousemove=null; document.onmouseup=null; };
      };

      (panel.querySelector('#vt-close') as HTMLButtonElement).onclick = ()=>{ hidePanel(); };
      return panel;
    }

    function showPanel(s: any) {
      if (!panel) buildPanel(s);
      panelVisible = true;
      panel!.classList.remove('hidden');
      panel!.style.display = 'block';
    }
    function hidePanel() {
      if (!panel) return;
      panelVisible = false;
      panel!.classList.add('hidden');
      panel!.style.display = 'none';
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'v') {
        try { const saved = localStorage.getItem('setsuna.viseme'); if (saved) Object.assign(VISEME_SETTINGS, JSON.parse(saved)); } catch {}
        panelVisible ? hidePanel() : showPanel(VISEME_SETTINGS);
      }
    };
    window.addEventListener('keydown', onKey);
    (window as any).__showTuner = () => showPanel(VISEME_SETTINGS);
    (window as any).__hideTuner = () => hidePanel();
    (window as any).__toggleTuner = () => { panelVisible ? hidePanel() : showPanel(VISEME_SETTINGS); };
    return () => { window.removeEventListener('keydown', onKey); panel?.remove(); panel=null; };
  }, []);

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let vrm: VRM | null = null;
    let raf = 0;
    const clock = new THREE.Clock();

    const el = containerRef.current;
    if (!el) return;

    // renderer (append to container)
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // scene & camera
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0f12);
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.3, 2.1);

    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(1, 1, 1);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));

    // load VRM
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.load(
      "/models/setsuna.vrm",
      (gltf) => {
        vrm = gltf.userData.vrm as VRM;
        if (vrm) {
          VRMUtils.removeUnnecessaryJoints(vrm.scene);
          VRMUtils.removeUnnecessaryVertices(vrm.scene);
          vrm.scene.traverse((obj: any) => {
            obj.frustumCulled = false;
          });
          scene!.add(vrm.scene);
          vrmRef.current = vrm;
          try {
            const names = (vrm as any)?.expressionManager?.expressions?.map?.((e: any) => e.expressionName) ?? "(none)";
            console.log("[VRM] Available expressions:", names);
          } catch {}
          presetRef.current = resolvePreset(vrm);
          setAvatarLoaded(true);
        }
      },
      undefined,
      (err) => {
        console.error("Failed to load VRM", err);
        setAvatarLoaded(false);
      }
    );

    // camera & framing
    const frameVrm = () => {
      if (!camera) return;
      camera.position.set(0, 1.45, 2.4);
      try {
        const head = vrmRef.current?.humanoid?.getBoneNode('head' as any);
        if (head) {
          const hp = new THREE.Vector3();
          head.getWorldPosition(hp);
          camera.lookAt(hp);
        } else {
          camera.lookAt(new THREE.Vector3(0, 1.45, 0));
        }
      } catch {
        camera.lookAt(new THREE.Vector3(0, 1.45, 0));
      }
    };

    const resize = () => {
      if (!renderer || !camera || !el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      frameVrm();
    };
    const observer = new ResizeObserver(resize);
    resize();
    observer.observe(el);

    const timeDomainArray = new Uint8Array(2048);
    const freqArray = new Uint8Array(2048);
    let listenTilt = 0; // head tilt amount
    let joy = 0, surprised = 0, neutral = 0.2; // base emotes

    function rms(arr: Uint8Array, from: number, to: number){
      let s=0, n=0; for(let k=from; k<to && k<arr.length; k++){ const v=(arr[k]-128)/128; s+=v*v; n++; }
      return Math.sqrt(s/Math.max(1,n));
    }
    function gate(x: number, th=0.015){ return x<th ? 0 : (x-th)/(1-th); }
    function limit(x: number, max=1){ return Math.min(max, x); }
    function smooth(prev: number, next: number, a=0.6){ return prev*a + next*(1-a); }

    // Global thinking pulse
    let thinking = 0;
    (window as any).__pokeThinking = () => { thinking = 1; };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const delta = clock.getDelta();
      if (vrm) {
        // Final priority logic: TTS wins when speaking; mic resumes when TTS stops
        const talking = (window as any).__isTTSSpeaking?.() === true;
        const ana = (ttsAnalyser && talking)
          ? ttsAnalyser
          : (!talking && useMic ? micAnalyserRef.current : null);

        if (ana) {
          try {
            // ensure responsive analyser params
            try { (ana as any).fftSize = 1024; (ana as any).smoothingTimeConstant = 0.02; } catch {}
            const size = Math.min(timeDomainArray.length, ana.frequencyBinCount);
            if (size > 0) {
              if (ana !== lastAnalyserRef.current) {
                visemeRef.current = new VisemeEngine(ana, VISEME_SETTINGS);
                lastAnalyserRef.current = ana;
              } else {
                visemeRef.current?.setAnalyser(ana);
              }

              const out = visemeRef.current?.tick(delta);
              if (out) {
                const PRESET = presetRef.current;
                setExpr(vrm, PRESET.A, out.A);
                setExpr(vrm, PRESET.E, out.E);
                setExpr(vrm, PRESET.I, out.I);
                setExpr(vrm, PRESET.O, out.O);
                setExpr(vrm, PRESET.U, out.U);
                const meters = (window as any).__visemeMeters as HTMLDivElement | undefined;
                if (meters && meters.style.display !== "none") {
                  meters.textContent = `A:${out.A.toFixed(2)} E:${out.E.toFixed(2)} I:${out.I.toFixed(2)} O:${out.O.toFixed(2)} U:${out.U.toFixed(2)}`;
                }
              }
            } else {
              // close when no bins
              const PRESET = presetRef.current;
              setExpr(vrm, PRESET.A, 0);
              setExpr(vrm, PRESET.E, 0);
              setExpr(vrm, PRESET.I, 0);
              setExpr(vrm, PRESET.O, 0);
              setExpr(vrm, PRESET.U, 0);
            }
          } catch {
            // ignore analyser errors
          }
        }

        // Emote state machine
        const speaking = (window as any).__isTTSSpeaking?.() === true;
        const listening = !speaking && !!(useMic && micAnalyserRef.current);
        thinking = Math.max(0, thinking - delta * 0.8); // decay quickly
        joy = Math.max(0, joy - delta * 0.5);
        surprised = Math.max(0, surprised - delta * 0.5);
        neutral = Math.max(0.15, neutral - delta * 0.2);

        if (speaking) {
          joy = Math.min(0.3, joy + delta * 0.6);
        } else if (listening) {
          surprised = Math.min(0.2, surprised + delta * 0.6);
          listenTilt = THREE.MathUtils.lerp(listenTilt, 0.05, 0.1);
        } else if (thinking > 0.01) {
          neutral = Math.min(0.3, neutral + delta * 0.6);
          listenTilt = THREE.MathUtils.lerp(listenTilt, -0.03, 0.1);
        } else {
          listenTilt = THREE.MathUtils.lerp(listenTilt, 0, 0.1);
        }

        // Apply emotion mapping if provided
        if (emotion) {
          const inten = Math.max(0, Math.min(1, emotion.intensity ?? 0.4));
          const keyHappy: any = (VRMExpressionPresetName as any).Happy ?? (VRMExpressionPresetName as any).Joy ?? null;
          const keySurprised: any = (VRMExpressionPresetName as any).Surprised ?? null;
          switch (emotion.emotion) {
            case 'happy':
              if (keyHappy) vrm.expressionManager?.setValue(keyHappy, Math.max(joy, 0.2 + 0.4*inten));
              break;
            case 'excited':
              if (keyHappy) vrm.expressionManager?.setValue(keyHappy, Math.max(joy, 0.3 + 0.5*inten));
              listenTilt = THREE.MathUtils.lerp(listenTilt, 0.06, 0.2);
              break;
            case 'smug':
              if (keyHappy) vrm.expressionManager?.setValue(keyHappy, Math.max(joy, 0.2 + 0.3*inten));
              listenTilt = THREE.MathUtils.lerp(listenTilt, -0.04, 0.2);
              break;
            case 'confused':
              if (keySurprised) vrm.expressionManager?.setValue(keySurprised, Math.max(surprised, 0.15 + 0.3*inten));
              break;
            case 'sad':
              // reduce joy via neutral emphasis
              neutral = Math.max(neutral, 0.25 + 0.3*inten);
              break;
            default:
              break;
          }
        }

        // Apply emote expressions
        const keyHappy: any = (VRMExpressionPresetName as any).Happy ?? (VRMExpressionPresetName as any).Joy ?? null;
        const keySurprised: any = (VRMExpressionPresetName as any).Surprised ?? null;
        const keyNeutral: any = (VRMExpressionPresetName as any).Neutral ?? null;
        if (keyHappy) vrm.expressionManager?.setValue(keyHappy, joy);
        if (keySurprised) vrm.expressionManager?.setValue(keySurprised, surprised);
        if (keyNeutral) vrm.expressionManager?.setValue(keyNeutral, neutral);

        // Subtle head tilt
        if (vrm.humanoid?.getBoneNode("head" as any)) {
          const head = vrm.humanoid.getBoneNode("head" as any)!;
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, listenTilt, 0.2);
        }
        vrm.update(delta);
      }
      renderer!.render(scene!, camera!);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (vrm) {
        scene?.remove(vrm.scene);
      }
      if (renderer) {
        try { el.removeChild(renderer.domElement); } catch {}
        renderer.dispose();
      }
      setAvatarLoaded(false);
    };
  }, [setAvatarLoaded, ttsAnalyser, useMic]);

  useEffect(() => {
    // Debug meters overlay, hidden by default, toggle with 'M'
    if (typeof window === 'undefined') return;
    if (!(window as any).__visemeMeters) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:9999;font:12px monospace;color:#9fe;background:#0008;padding:6px;border-radius:8px;display:none';
      document.body.appendChild(el);
      (window as any).__visemeMeters = el;
      (window as any).__toggleMeters = () => { el.style.display = el.style.display === 'none' ? 'block' : 'none'; };
      window.addEventListener('keydown', (e) => { if (e.key.toLowerCase()==='m') (window as any).__toggleMeters(); });
    }
  }, []);

  useEffect(() => {
    // Global mic starter
    (window as any).__startMic = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.02;
        src.connect(analyser);
        micAnalyserRef.current = analyser;
        micCtxRef.current = ctx;
        return analyser;
      } catch (e) {
        console.error("Mic init failed", e);
        throw e;
      }
    };
    return () => {
      (window as any).__startMic = undefined;
    };
  }, []);

  return (<div ref={containerRef} style={{width:'100%',height:'100%'}} />);
}
