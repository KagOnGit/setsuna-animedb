import * as THREE from "three";
import { Quaternion, Euler, Object3D } from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

type BoneName =
  | "hips" | "spine" | "chest" | "upperChest"
  | "neck" | "head"
  | "leftUpperArm" | "rightUpperArm"
  | "leftLowerArm" | "rightLowerArm"
  | "leftHand" | "rightHand"
  | "leftUpperLeg" | "rightUpperLeg"
  | "leftLowerLeg" | "rightLowerLeg";

const DEG = (d:number)=>d*Math.PI/180;
const q = (x=0,y=0,z=0, order:"YXZ"|"XYZ"="YXZ") => {
  const e = new Euler(DEG(x),DEG(y),DEG(z),order);
  const qq = new Quaternion(); qq.setFromEuler(e); return qq;
};

export type Reaction = "IDLE"|"EXCITED"|"SMUG"|"SAD"|"CONFUSED"|"TSUN"|"DERE";

const IDLE: Partial<Record<BoneName, Quaternion>> = {
  hips: q(0,0,3), spine:q(3,0,0), chest:q(4,0,-2), upperChest:q(2,0,-2),
  neck:q(-4,0,4), head:q(-2,0,4),
  leftUpperArm:q(5,8,-18), leftLowerArm:q(-8,0,-8), leftHand:q(0,0,-6),
  rightUpperArm:q(5,-8,18), rightLowerArm:q(-8,0,8), rightHand:q(0,0,6),
  leftUpperLeg:q(2,2,2), leftLowerLeg:q(-3,0,0),
  rightUpperLeg:q(0,-2,-2), rightLowerLeg:q(-2,0,0),
};

const POSES: Record<Reaction, Partial<Record<BoneName, Quaternion>>> = {
  IDLE,
  EXCITED:{ chest:q(8,0,0), upperChest:q(6,0,0), neck:q(-6,0,2), head:q(-4,0,4),
            leftUpperArm:q(10,10,-6), rightUpperArm:q(10,-10,6), leftLowerArm:q(-6,0,-10), rightLowerArm:q(-6,0,10) },
  SMUG:{ hips:q(0,0,-3), chest:q(2,4,-4), upperChest:q(2,6,-4), neck:q(-2,0,-8), head:q(-2,0,-10) },
  SAD:{ chest:q(-6,0,0), upperChest:q(-6,0,0), neck:q(6,0,0), head:q(8,0,0),
        leftUpperArm:q(0,0,-8), rightUpperArm:q(0,0,8) },
  CONFUSED:{ neck:q(-2,0,10), head:q(-2,0,12), chest:q(0,-4,0) },
  TSUN:{ chest:q(2,0,0), upperChest:q(2,0,0),
         leftUpperArm:q(5,30,-35), rightUpperArm:q(5,-30,35),
         leftLowerArm:q(-20,0,-10), rightLowerArm:q(-20,0,10) },
  DERE:{ neck:q(-4,0,-6), head:q(-4,0,-10),
         leftUpperArm:q(12,20,-20), rightUpperArm:q(12,-20,20),
         leftLowerArm:q(-15,0,-8), rightLowerArm:q(-15,0,8) },
};

function bone(vrm:any,name:BoneName){
  const h = vrm?.humanoid;
  if (h?.getNormalizedBoneNode) { try { return h.getNormalizedBoneNode(name as any); } catch {} }
  return h?.getBoneNode?.(name as any) ?? vrm?.scene?.getObjectByName?.(name) ?? null;
}

export class PoseRig {
  private vrm:any;
  private bones:Partial<Record<BoneName,Object3D>> = {};
  private target:Partial<Record<BoneName,Quaternion>>={};
  private t=0; private reactionTimer=0;
  stiffness=0.24; breathe=0.8; sway=0.9; returnSpeed=1.9;

  constructor(vrm:any, opts?: { snapOnInit?: boolean }){
    this.vrm = vrm;
    (['hips','spine','chest','upperChest','neck','head',
      'leftUpperArm','rightUpperArm','leftLowerArm','rightLowerArm',
      'leftHand','rightHand','leftUpperLeg','rightUpperLeg','leftLowerLeg'] as BoneName[])
      .forEach(n=>this.bones[n]=bone(vrm,n)||undefined);
    if (opts?.snapOnInit !== false) {
      this.setPose('IDLE',1,true); // snap out of T-pose
    }
  }

  setPose(name:Reaction,intensity=1,snap=false){
    const base = POSES[name] || IDLE;
    this.target = {};
    for (const k in IDLE) {
      const b = this.bones[k as BoneName]; if (!b) continue;
      const idle = IDLE[k as BoneName]!;
      const pose = (base[k as BoneName] ?? idle).clone();
      const blended = new Quaternion().slerp(pose, intensity);
      this.target[k as BoneName] = blended;
      if (snap) b.quaternion.copy(blended);
    }
  }

  trigger(name:Reaction,duration=1.0,intensity=1){ this.setPose(name,intensity,false); this.reactionTimer = duration; }
  reset(){ this.setPose('IDLE',1,false); }

  tick(dt:number){
    this.t += dt;
    if (this.reactionTimer>0) { this.reactionTimer -= dt*this.returnSpeed; if (this.reactionTimer<=0) this.setPose('IDLE',1,false); }

    // idle breathing/sway (small)
    const chest = this.bones.chest, upper = this.bones.upperChest ?? chest, neck = this.bones.neck;
    const breath = Math.sin(this.t*1.1)*this.breathe;
    const swayX = Math.sin(this.t*0.6)*this.sway, swayZ = Math.cos(this.t*0.55)*(this.sway*0.6);
    if (chest) chest.quaternion.multiply(q(breath*0.12,0,0));
    if (upper) upper.quaternion.multiply(q(breath*0.10,swayX*0.04,swayZ*0.04));
    if (neck)  neck.quaternion.multiply(q(0,0,swayZ*0.02));

    // spring toward target
    for (const k in this.target) {
      const b = this.bones[k as BoneName]; if (!b) continue;
      b.quaternion.slerp(this.target[k as BoneName]!, this.stiffness);
    }
  }

  adoptCurrentAsIdle() {
    const names = Object.keys(this.bones) as BoneName[];
    this.target = {} as Partial<Record<BoneName, Quaternion>>;
    for (const n of names) {
      const b = this.bones[n];
      if (!b) continue;
      (this.target as any)[n] = b.quaternion.clone();
    }
  }
}

// ===== Elegant Idle (VRM v2-compatible helpers) =====
const DEG_E = Math.PI / 180;
const tmpEuler = new Euler(0, 0, 0, "YXZ");
const tmpQ = new Quaternion();
const baseQ = new Map<VRMHumanBoneName, Quaternion>();

function setAndCache(
  bone: VRMHumanBoneName,
  node: Object3D | null | undefined,
  xDeg = 0,
  yDeg = 0,
  zDeg = 0
) {
  if (!node) return;
  tmpEuler.set(xDeg * DEG_E, yDeg * DEG_E, zDeg * DEG_E, "YXZ");
  node.quaternion.setFromEuler(tmpEuler);
  baseQ.set(bone, node.quaternion.clone());
}

export function applyElegantIdle(vrm: VRM) {
  const h = vrm.humanoid;
  if (!h) return;

  const hips = h.getNormalizedBoneNode("hips" as any);
  const spine = h.getNormalizedBoneNode("spine" as any);
  const chest = h.getNormalizedBoneNode("chest" as any);
  const neck = h.getNormalizedBoneNode("neck" as any);
  const head = h.getNormalizedBoneNode("head" as any);

  const lShoulder = h.getNormalizedBoneNode("leftShoulder" as any);
  const rShoulder = h.getNormalizedBoneNode("rightShoulder" as any);
  const lUpperArm = h.getNormalizedBoneNode("leftUpperArm" as any);
  const rUpperArm = h.getNormalizedBoneNode("rightUpperArm" as any);
  const lLowerArm = h.getNormalizedBoneNode("leftLowerArm" as any);
  const rLowerArm = h.getNormalizedBoneNode("rightLowerArm" as any);
  const lHand = h.getNormalizedBoneNode("leftHand" as any);
  const rHand = h.getNormalizedBoneNode("rightHand" as any);

  const lUpperLeg = h.getNormalizedBoneNode("leftUpperLeg" as any);
  const rUpperLeg = h.getNormalizedBoneNode("rightUpperLeg" as any);
  const lLowerLeg = h.getNormalizedBoneNode("leftLowerLeg" as any);
  const rLowerLeg = h.getNormalizedBoneNode("rightLowerLeg" as any);

  // Contrapposto base (subtle)
  setAndCache("hips" as any, hips, 0, 0, 2);
  setAndCache("spine" as any, spine, 2, 0, -3);
  setAndCache("chest" as any, chest, 0, 0, -2);
  setAndCache("neck" as any, neck, 0, 0, 2);
  setAndCache("head" as any, head, 2, 5, 0);

  // Shoulders down/back
  setAndCache("leftShoulder" as any, lShoulder, 0, 0, -6);
  setAndCache("rightShoulder" as any, rShoulder, 0, 0, 6);

  // Arms relaxed (non-floaty)
  setAndCache("leftUpperArm" as any, lUpperArm, 10, 8, -12);
  setAndCache("rightUpperArm" as any, rUpperArm, 10, -8, 12);

  setAndCache("leftLowerArm" as any, lLowerArm, -8, 0, -4);
  setAndCache("rightLowerArm" as any, rLowerArm, -8, 0, 4);

  setAndCache("leftHand" as any, lHand, 0, 0, -5);
  setAndCache("rightHand" as any, rHand, 0, 0, 5);

  // Legs natural stance
  setAndCache("leftUpperLeg" as any, lUpperLeg, -2, 2, 0);
  setAndCache("rightUpperLeg" as any, rUpperLeg, -1, -1, 0);
  setAndCache("leftLowerLeg" as any, lLowerLeg, 2, 0, 0);
  setAndCache("rightLowerLeg" as any, rLowerLeg, 3, 0, 0);
}

function blendOffset(
  node: Object3D | null | undefined,
  base: Quaternion | undefined,
  xDeg = 0,
  yDeg = 0,
  zDeg = 0
) {
  if (!node || !base) return;
  tmpEuler.set(xDeg * DEG_E, yDeg * DEG_E, zDeg * DEG_E, "YXZ");
  tmpQ.setFromEuler(tmpEuler);
  node.quaternion.copy(base).multiply(tmpQ);
}

export function tickElegantIdle(vrm: VRM, timeMs: number) {
  const t = timeMs * 0.001;
  const h = vrm.humanoid;
  if (!h) return;

  const chest = h.getNormalizedBoneNode("chest" as any);
  const neck = h.getNormalizedBoneNode("neck" as any);
  const head = h.getNormalizedBoneNode("head" as any);

  // Subtle breathing sway; keep arms steady
  const breathe = Math.sin(t * 1.05) * 1.0; // degrees
  const headYaw = Math.sin(t * 0.6) * 1.0;

  blendOffset(chest, baseQ.get("chest" as any), breathe * 0.20, 0, 0);
  blendOffset(neck, baseQ.get("neck" as any), breathe * 0.10, 0, 0);
  blendOffset(head, baseQ.get("head" as any), 0, headYaw * 0.20, 0);
}

// ===== New helpers: hands-behind-back + soft idle sway =====
// Safe bone getter (exact behavior per request)
function boneSafe(vrm: VRM, name: string) {
  try {
    return vrm.humanoid?.getBoneNode(name as any) ?? null;
  } catch {
    return null;
  }
}

function setRot(n: THREE.Object3D | null, x = 0, y = 0, z = 0) {
  if (!n) return;
  n.rotation.set(x, y, z);
  n.updateMatrixWorld(true);
}

export function applyDaintyHandsBehindBack(vrm: VRM) {
  const hips        = boneSafe(vrm, "hips");
  const spine       = boneSafe(vrm, "spine");
  const chest       = boneSafe(vrm, "chest") || boneSafe(vrm, "upperChest");
  const neck        = boneSafe(vrm, "neck");
  const head        = boneSafe(vrm, "head");

  const lShoulder   = boneSafe(vrm, "leftShoulder");
  const rShoulder   = boneSafe(vrm, "rightShoulder");
  const lUpperArm   = boneSafe(vrm, "leftUpperArm");
  const rUpperArm   = boneSafe(vrm, "rightUpperArm");
  const lLowerArm   = boneSafe(vrm, "leftLowerArm");
  const rLowerArm   = boneSafe(vrm, "rightLowerArm");
  const lHand       = boneSafe(vrm, "leftHand");
  const rHand       = boneSafe(vrm, "rightHand");

  // Graceful posture
  setRot(hips,  -0.05,  0.00,  0.00);  // tiny forward hip tilt
  setRot(spine,  0.06,  0.00,  0.00);
  setRot(chest,  0.04,  0.03,  0.00);
  setRot(neck,   0.02,  0.00,  0.06);
  setRot(head,   0.00,  0.05, -0.04);  // slight coy head lean

  // Shoulders slightly back (open chest)
  setRot(lShoulder, 0.00,  0.12, -0.05);
  setRot(rShoulder, 0.00, -0.12,  0.05);

  // Arms relaxed down and swept behind body
  // Local axes: x=pitch, y=yaw (around up), z=roll
  setRot(lUpperArm,  0.25,  0.75, -1.05);
  setRot(rUpperArm,  0.25, -0.75,  1.05);

  // Elbows slightly bent inward
  setRot(lLowerArm, -0.55,  0.15, -0.10);
  setRot(rLowerArm, -0.55, -0.15,  0.10);

  // Hands near lower back, palms inward
  setRot(lHand, 0.00,  0.85,  0.25);
  setRot(rHand, 0.00, -0.85, -0.25);
}

export function applyIdleSway(vrm: VRM, t: number) {
  const hips  = boneSafe(vrm, "hips");
  const chest = boneSafe(vrm, "chest") || boneSafe(vrm, "upperChest");
  const head  = boneSafe(vrm, "head");

  const sway = Math.sin(t * 2.6) * 0.02; // ± ~1.1°
  const bob  = Math.sin(t * 1.3) * 0.01; // subtle up/down

  if (hips) {
    hips.rotation.y = sway;
    hips.position.y = bob;
    hips.updateMatrixWorld(true);
  }
  if (chest) {
    chest.rotation.y = -sway * 0.6;
    chest.updateMatrixWorld(true);
  }
  if (head) {
    head.rotation.z = Math.sin(t * 2.0) * 0.03 - 0.04;
    head.updateMatrixWorld(true);
  }
}
