import * as THREE from 'three/webgpu';
import type { FlowerTrajectoryFrame } from './flower-trajectory';

export const FLOWER_CONTACT_SESSION = Object.freeze({
  heldDecayPerSecond: 0.16,
  releaseDecayPerSecond: 1.35,
  coverageEnergyPerPatch: 0.005,
  motionEnergyPerUv: 0.36,
  highProgressGainFloor: 0.425,
  progressGainExponent: 2,
  motionThresholdUvPerSecond: 0.025,
  brokenPetalDwellSeconds: 0.9,
  inversionSeconds: 0.084,
  corruptionStutterSeconds: 0.12,
  corruptionStutterHertz: 24,
});

export type CorruptedPetalMasks = {
  low: number;
  high: number;
};

export type FlowerContactSessionSnapshot = {
  progress: number;
  corruptedPetalMasks: CorruptedPetalMasks;
  corruptedPetalIndex: number;
  corruptionPhase: number;
};

export function advanceFlowerEnergyDecay(
  progress: number,
  elapsedSeconds: number,
  decayPerSecond: number,
) {
  return Math.max(
    0,
    progress - elapsedSeconds * decayPerSecond,
  );
}

export function calculateFlowerContactEnergyGain(
  progress: number,
  interactionEffortEnergy: number,
) {
  const normalizedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  const remainingProgress = 1 - normalizedProgress;
  const gainScale =
    FLOWER_CONTACT_SESSION.highProgressGainFloor +
    (1 - FLOWER_CONTACT_SESSION.highProgressGainFloor) *
      remainingProgress ** FLOWER_CONTACT_SESSION.progressGainExponent;
  return Math.max(0, interactionEffortEnergy) * gainScale;
}

export function isFlowerPetalCorrupted(
  snapshot: FlowerContactSessionSnapshot,
  petalIndex: number,
) {
  if (petalIndex < 0 || petalIndex >= 64) return false;
  const mask = petalIndex < 32
    ? snapshot.corruptedPetalMasks.low
    : snapshot.corruptedPetalMasks.high;
  return (mask & (1 << (petalIndex % 32))) !== 0;
}

export function createFlowerContactSession() {
  const coveredPatches = new Set<string>();
  const petalDwellSeconds = new Map<number, number>();
  const snapshot: FlowerContactSessionSnapshot = {
    progress: 0,
    corruptedPetalMasks: { low: 0, high: 0 },
    corruptedPetalIndex: -1,
    corruptionPhase: 0,
  };
  let previousTimestamp: number | null = null;
  let currentPetalIndex = -1;
  let corruptionStartedAt: number | null = null;
  let sessionActive = false;

  function clearCurrentPetalState() {
    currentPetalIndex = -1;
    corruptionStartedAt = null;
    snapshot.corruptedPetalIndex = -1;
    snapshot.corruptionPhase = 0;
  }

  function clearContactState() {
    clearCurrentPetalState();
    petalDwellSeconds.clear();
    snapshot.corruptedPetalMasks.low = 0;
    snapshot.corruptedPetalMasks.high = 0;
  }

  function endSession() {
    if (!sessionActive) return;
    sessionActive = false;
    coveredPatches.clear();
    clearContactState();
  }

  function reset() {
    sessionActive = false;
    previousTimestamp = null;
    coveredPatches.clear();
    snapshot.progress = 0;
    clearContactState();
  }

  function update(timestamp: number, frame: FlowerTrajectoryFrame) {
    const elapsedSeconds = previousTimestamp === null
      ? 0
      : THREE.MathUtils.clamp(
          (timestamp - previousTimestamp) / 1000,
          0,
          0.05,
        );
    previousTimestamp = timestamp;
    const validContact =
      frame.held &&
      frame.contactValidated &&
      frame.contactPetalIndex >= 0 &&
      frame.contactCellIndex >= 0 &&
      frame.contactTriangleIndex >= 0;

    if (!validContact) {
      if (frame.held) {
        clearCurrentPetalState();
      } else {
        endSession();
      }
      snapshot.progress = advanceFlowerEnergyDecay(
        snapshot.progress,
        elapsedSeconds,
        FLOWER_CONTACT_SESSION.releaseDecayPerSecond,
      );
      return snapshot;
    }

    const beganContact = !sessionActive;
    sessionActive = true;
    if (currentPetalIndex !== frame.contactPetalIndex) {
      clearCurrentPetalState();
      currentPetalIndex = frame.contactPetalIndex;
    }
    const petalDwell =
      (petalDwellSeconds.get(currentPetalIndex) ?? 0) + elapsedSeconds;
    petalDwellSeconds.set(currentPetalIndex, petalDwell);
    const patchKey =
      `${frame.contactPetalIndex}:` +
      `${frame.contactCellIndex}:` +
      `${frame.contactTriangleIndex}`;
    const newPatch = !coveredPatches.has(patchKey);
    coveredPatches.add(patchKey);
    const motionSpeed = frame.velocityUvPerSecond.length();
    const moving =
      motionSpeed > FLOWER_CONTACT_SESSION.motionThresholdUvPerSecond;
    const coverageEnergy = !beganContact && newPatch && moving
      ? FLOWER_CONTACT_SESSION.coverageEnergyPerPatch
      : 0;
    const motionEnergy = moving
      ? Math.min(
          0.06,
          motionSpeed *
            FLOWER_CONTACT_SESSION.motionEnergyPerUv *
            elapsedSeconds,
        )
      : 0;
    const interactionEffortEnergy = coverageEnergy + motionEnergy;
    snapshot.progress = THREE.MathUtils.clamp(
      snapshot.progress + calculateFlowerContactEnergyGain(
        snapshot.progress,
        interactionEffortEnergy,
      ) -
        elapsedSeconds * FLOWER_CONTACT_SESSION.heldDecayPerSecond,
      0,
      1,
    );
    const shouldCorrupt =
      petalDwell >= FLOWER_CONTACT_SESSION.brokenPetalDwellSeconds;
    if (
      shouldCorrupt &&
      corruptionStartedAt === null &&
      !isFlowerPetalCorrupted(snapshot, currentPetalIndex)
    ) {
      const maskBit = 1 << (currentPetalIndex % 32);
      if (currentPetalIndex < 32) {
        snapshot.corruptedPetalMasks.low =
          (snapshot.corruptedPetalMasks.low | maskBit) >>> 0;
      } else {
        snapshot.corruptedPetalMasks.high =
          (snapshot.corruptedPetalMasks.high | maskBit) >>> 0;
      }
      corruptionStartedAt = timestamp;
      snapshot.corruptedPetalIndex = currentPetalIndex;
    }
    if (corruptionStartedAt !== null) {
      const corruptionElapsedSeconds = Math.max(
        0,
        (timestamp - corruptionStartedAt) / 1000,
      );
      snapshot.corruptionPhase = Math.max(0.0001, corruptionElapsedSeconds);
    }
    return snapshot;
  }

  function dispose() {
    coveredPatches.clear();
    petalDwellSeconds.clear();
  }

  return {
    update,
    reset,
    snapshot,
    dispose,
  };
}
