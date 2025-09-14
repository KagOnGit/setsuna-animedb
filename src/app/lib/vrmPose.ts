// src/app/lib/vrmPose.ts
import * as THREE from "three";
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

export type VRMPoseEuler = { x: number; y: number; z: number }; // degrees
export type VRMPoseQuat  = { x: number; y: number; z: number; w: number };
export type VRMPoseBone  = { rotation?: VRMPoseEuler | VRMPoseQuat; position?: { x: number; y: number; z: number } };
export type VRMPoseFile  = { bones?: Record<string, VRMPoseBone> } & Record<string, any>;

export type PoseSpace = "unity" | "three";

/**
 * Options for pose application:
 * - space: source coordinate space of the JSON. "unity" is typical for VRM/Unity/exporters.
 * - invert: optional axis flips; by default we flip X & Z when space === "unity" to correct pitch/roll.
 * - mix:   0..1 slerp mix for smooth blending (default 1 → snap).
 */
export type ApplyPoseOpts = {
  space?: PoseSpace;
  invert?: { x?: boolean; y?: boolean; z?: boolean } | "all";
  mix?: number;
};

const D2R = Math.PI / 180;

function eulerToQuatDeg(xDeg: number, yDeg: number, zDeg: number, order: THREE.EulerOrder = "XYZ") {
  const e = new THREE.Euler(xDeg * D2R, yDeg * D2R, zDeg * D2R, order);
  const q = new THREE.Quaternion();
  q.setFromEuler(e);
  return q;
}

function resolveInvert(space: PoseSpace | undefined, invertOpt: ApplyPoseOpts["invert"]) {
  if (invertOpt === "all") return { x: true, y: true, z: true };
  if (invertOpt) return {
    x: !!invertOpt.x,
    y: !!invertOpt.y,
    z: !!invertOpt.z,
  };
  // Default: Unity/VRM JSON needs X & Z inverted when applied to three-vrm normalized nodes.
  // This fixes "looking up vs down", "arms up vs down", "legs crossed vs split".
  if (space === "unity" || space === undefined) return { x: true, y: false, z: true };
  return { x: false, y: false, z: false };
}

function toQuatFromBoneRotation(rot: VRMPoseEuler | VRMPoseQuat, space: PoseSpace | undefined, invertOpt: ApplyPoseOpts["invert"]) {
  const inv = resolveInvert(space, invertOpt);
  if ((rot as VRMPoseQuat).w !== undefined) {
    // JSON already contains a quaternion (assume three-space); allow optional axis flips via conjugation of Euler
    const q = new THREE.Quaternion((rot as VRMPoseQuat).x, (rot as VRMPoseQuat).y, (rot as VRMPoseQuat).z, (rot as VRMPoseQuat).w);
    if (!inv.x && !inv.y && !inv.z) return q;
    // If we must flip, convert to euler, flip, back to quat
    const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
    e.set(inv.x ? -e.x : e.x, inv.y ? -e.y : e.y, inv.z ? -e.z : e.z, "XYZ");
    const out = new THREE.Quaternion();
    out.setFromEuler(e);
    return out;
  } else {
    const e = rot as VRMPoseEuler;
    const x = inv.x ? -e.x : e.x;
    const y = inv.y ? -e.y : e.y;
    const z = inv.z ? -e.z : e.z;
    return eulerToQuatDeg(x, y, z, "XYZ");
  }
}

const NAME_MAP: Record<string, VRMHumanBoneName> = {
  // common keys from VRM viewer / UniVRM JSON
  hips: VRMHumanBoneName.Hips,
  spine: VRMHumanBoneName.Spine,
  chest: VRMHumanBoneName.Chest,
  upperChest: VRMHumanBoneName.UpperChest,
  neck: VRMHumanBoneName.Neck,
  head: VRMHumanBoneName.Head,
  leftShoulder: VRMHumanBoneName.LeftShoulder,
  rightShoulder: VRMHumanBoneName.RightShoulder,
  leftUpperArm: VRMHumanBoneName.LeftUpperArm,
  rightUpperArm: VRMHumanBoneName.RightUpperArm,
  leftLowerArm: VRMHumanBoneName.LeftLowerArm,
  rightLowerArm: VRMHumanBoneName.RightLowerArm,
  leftHand: VRMHumanBoneName.LeftHand,
  rightHand: VRMHumanBoneName.RightHand,
  leftUpperLeg: VRMHumanBoneName.LeftUpperLeg,
  rightUpperLeg: VRMHumanBoneName.RightUpperLeg,
  leftLowerLeg: VRMHumanBoneName.LeftLowerLeg,
  rightLowerLeg: VRMHumanBoneName.RightLowerLeg,
  leftFoot: VRMHumanBoneName.LeftFoot,
  rightFoot: VRMHumanBoneName.RightFoot,
  leftToes: VRMHumanBoneName.LeftToes,
  rightToes: VRMHumanBoneName.RightToes,
};

export async function loadPose(url: string): Promise<VRMPoseFile> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pose fetch failed: ${res.status}`);
  return await res.json();
}

/**
 * Apply pose with axis correction onto normalized humanoid bones.
 * This sets the bones' **local** quaternion each frame when you want it “hard” locked.
 */
export function applyVRMPoseHard(vrm: VRM, pose: VRMPoseFile, opts?: ApplyPoseOpts) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return;
  const mix = Math.max(0, Math.min(1, opts?.mix ?? 1));

  // Pose data may live at pose.bones or top-level "humanoid.bones".
  const bones: Record<string, VRMPoseBone> =
    pose.bones ??
    (pose as any).humanoid?.bones ??
    (pose as any).Humanoid?.bones ??
    {};

  for (const k of Object.keys(bones)) {
    const vrmName = NAME_MAP[k] ?? (k as VRMHumanBoneName);
    const node = humanoid.getNormalizedBoneNode(vrmName);
    if (!node) continue;

    const b = bones[k];
    if (b.rotation) {
      const targetQ = toQuatFromBoneRotation(b.rotation, opts?.space, opts?.invert);
      if (mix >= 1) {
        node.quaternion.copy(targetQ);
      } else {
        node.quaternion.slerp(targetQ, mix);
      }
      node.updateMatrixWorld();
    }

    if (b.position && vrmName === VRMHumanBoneName.Hips) {
      // Optional: apply hips offset (meters) with Unity->three correction (Z forward vs -Z forward)
      const inv = resolveInvert(opts?.space, opts?.invert);
      const px = inv.x ? -b.position.x : b.position.x;
      const py = inv.y ? -b.position.y : b.position.y;
      const pz = inv.z ? -b.position.z : b.position.z;
      node.position.set(px, py, pz);
      node.updateMatrixWorld();
    }
  }
}
