import {
  FLOWER_INTRO,
  flowerIntroPetalStartSeconds,
} from './flower-intro-contract';

export const FLOWER_PARTICLES = Object.freeze({
  maximumParticles: 4096,
  emissionRatePerSecond: 1680,
  stageThreeEmissionRatePerSecond: 1080,
  stageThreeSizeMultiplier: 2,
  minimumLifetimeSeconds: 1.44,
  maximumLifetimeSeconds: 3.1,
  minimumSize: 0.008,
  maximumSize: 0.022,
  deathShrinkFraction: 0.34,
  curlSpatialFrequency: 7.5,
  curlAcceleration: 0.0825,
  upwardAcceleration: 0.1125,
  minimumInitialUpwardVelocity: 0.24,
  maximumInitialUpwardVelocity: 0.46,
  stageThreeMinimumUpwardDirection: 0.42,
  stageThreeMaximumUpwardDirection: 0.94,
  stageThreeAttractionRadiusCssPixels: 540,
  stageThreeAttractionAcceleration: 4.6,
  connectionsPerParticle: 4,
  minimumConnectionBreakDistance: 0.08,
  maximumConnectionBreakDistance: 0.22,
  interactionVerticesPerSample: 4,
  interactionSourceRadiusCssPixels: 24,
  minimumInteractionRadialVelocity: 0.045,
  maximumInteractionRadialVelocity: 0.14,
  minimumInteractionUpwardVelocity: 0.28,
  maximumInteractionUpwardVelocity: 0.6,
  velocityDragPerSecond: 0.82,
  maximumDeltaSeconds: 0.05,
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value) {
  const amount = clamp01(value);
  return amount * amount * (3 - amount * 2);
}

export function flowerParticleDeathScale(age, lifetime) {
  if (lifetime <= 0 || age >= lifetime) return 0;
  const remaining = 1 - age / lifetime;
  return smoothstep01(
    remaining / FLOWER_PARTICLES.deathShrinkFraction,
  );
}

export function flowerIntroLeadingEdgeRootToTip(
  elapsedSeconds,
  outness,
) {
  return (
    (elapsedSeconds - flowerIntroPetalStartSeconds(outness)) /
    FLOWER_INTRO.rootToTipSweepSeconds
  );
}

export function flowerIntroLeadingEdgeBirthPosition(
  restPosition,
  introStartPosition,
  basisY,
  rootToTip,
) {
  const petalAgeSeconds =
    clamp01(rootToTip) * FLOWER_INTRO.rootToTipSweepSeconds;
  const curvinessFactor = smoothstep01(
    petalAgeSeconds / FLOWER_INTRO.curvinessBlendSeconds,
  );
  return restPosition.map((component, index) =>
    introStartPosition[index] * (1 - curvinessFactor) +
    component * curvinessFactor +
    basisY[index] * FLOWER_INTRO.leadingEdgeStretchPetalUnits,
  );
}

export function flowerIntroBilinearPosition(
  lowerLeft,
  lowerRight,
  upperLeft,
  upperRight,
  across,
  along,
) {
  const acrossAmount = clamp01(across);
  const alongAmount = clamp01(along);
  return lowerLeft.map((component, index) => {
    const lower =
      component * (1 - acrossAmount) +
      lowerRight[index] * acrossAmount;
    const upper =
      upperLeft[index] * (1 - acrossAmount) +
      upperRight[index] * acrossAmount;
    return lower * (1 - alongAmount) + upper * alongAmount;
  });
}

export function flowerParticleRingSlot(startSlot, eventIndex) {
  const maximumParticles =
    FLOWER_PARTICLES.maximumParticles;
  return (
    (Math.floor(startSlot) + Math.floor(eventIndex)) %
    maximumParticles
  );
}

export function flowerStageThreePetalIndex(
  spawnSequence,
  eventIndex,
  activePetalCount,
) {
  const count = Math.max(0, Math.floor(activePetalCount));
  if (count === 0) return -1;
  return (
    (Math.floor(spawnSequence) + Math.floor(eventIndex)) % count + count
  ) % count;
}

export function flowerStageThreeRimVertex(
  spawnSequence,
  eventIndex,
  activePetalCount,
  renderColumns,
  renderRows,
) {
  const petalCount = Math.max(0, Math.floor(activePetalCount));
  const columnCount = Math.max(0, Math.floor(renderColumns));
  const rowCount = Math.max(0, Math.floor(renderRows));
  if (petalCount === 0 || columnCount === 0 || rowCount === 0) return null;
  const sequence = Math.floor(spawnSequence) + Math.floor(eventIndex);
  return {
    column: ((Math.floor(sequence / petalCount) % columnCount) + columnCount) %
      columnCount,
    row: rowCount - 1,
  };
}

export function flowerStageThreeParticleSize(baseSize) {
  return baseSize *
    FLOWER_PARTICLES.stageThreeSizeMultiplier;
}

function flowerParticleSeededUnitFloat(seed, channel) {
  const channelOffset = Math.imul(channel, 0x9e3779b1) >>> 0;
  const state = (
    Math.imul((Math.floor(seed) + channelOffset) >>> 0, 747796405) +
    2891336453
  ) >>> 0;
  const word = Math.imul(
    ((state >>> ((state >>> 28) + 4)) ^ state) >>> 0,
    277803737,
  ) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 2 ** 32;
}

export function flowerStageThreeInitialVelocity(seed) {
  const angle = flowerParticleSeededUnitFloat(seed, 5) * Math.PI * 2;
  const upwardDirection =
    FLOWER_PARTICLES.stageThreeMinimumUpwardDirection +
    flowerParticleSeededUnitFloat(seed, 6) *
      (
        FLOWER_PARTICLES.stageThreeMaximumUpwardDirection -
        FLOWER_PARTICLES.stageThreeMinimumUpwardDirection
      );
  const lateralDirection = Math.sqrt(
    Math.max(0, 1 - upwardDirection * upwardDirection),
  );
  const speed =
    FLOWER_PARTICLES.minimumInitialUpwardVelocity +
    flowerParticleSeededUnitFloat(seed, 7) *
      (
        FLOWER_PARTICLES.maximumInitialUpwardVelocity -
        FLOWER_PARTICLES.minimumInitialUpwardVelocity
      );
  return [
    Math.cos(angle) * lateralDirection * speed,
    upwardDirection * speed,
    Math.sin(angle) * lateralDirection * speed,
  ];
}

export function flowerStageThreeEmissionStep(accumulator, deltaSeconds) {
  const accumulated = Math.max(0, accumulator) +
    FLOWER_PARTICLES.stageThreeEmissionRatePerSecond *
      Math.max(0, deltaSeconds);
  const spawnCount = Math.min(
    FLOWER_PARTICLES.maximumParticles,
    Math.floor(accumulated),
  );
  return {
    accumulator: accumulated - spawnCount,
    spawnCount,
  };
}

export function flowerStageThreeAttractionFalloff(distance) {
  const proximity = clamp01(
    1 - Math.max(0, distance) /
      FLOWER_PARTICLES.stageThreeAttractionRadiusCssPixels,
  );
  return smoothstep01(proximity);
}

export function flowerParticleConnectionIntensity(
  distance,
  breakDistance,
  particleOpacity,
) {
  if (breakDistance <= 0 || distance >= breakDistance) return 0;
  const ratio = clamp01(
    (breakDistance - distance) / (breakDistance * 0.32),
  );
  const fade = ratio * ratio * (3 - ratio * 2);
  return Math.max(0, particleOpacity) * fade;
}

export function selectNearestFlowerParticleVertices(
  candidates,
  maximumDistanceSquared,
) {
  return candidates
    .filter(({ distanceSquared }) =>
      distanceSquared <= maximumDistanceSquared)
    .sort((left, right) =>
      left.distanceSquared - right.distanceSquared ||
      left.traversalIndex - right.traversalIndex)
    .slice(
      0,
      FLOWER_PARTICLES.interactionVerticesPerSample,
    );
}
