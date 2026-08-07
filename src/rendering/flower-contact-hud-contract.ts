import * as THREE from 'three/webgpu';

export const FLOWER_CONTACT_HUD = Object.freeze({
  targetPlaneDiameter: 2.7,
  maximumViewportFraction: 1.44,
  landscapeViewportWidthFraction: 0.82,
  depthBehindTarget: 1.8,
  outerRadius: 0.92,
  progressSegments: 72,
  fanSegments: 36,
  primaryRingRadius: 0.824,
  primaryRingHalfWidth: 0.017,
  primaryRingHalfWidthVariation: 0.0325,
  primaryRingMinimumHalfWidth: 0.0015,
  primaryRingMaximumHalfWidth: 0.0495,
  horizontalProgressLeft: -0.32,
  horizontalProgressRight: 0.32,
  horizontalProgressCarrierWidth: 0.78,
  horizontalProgressCarrierHeight: 0.18,
  horizontalProgressCenterY: -0.035,
  horizontalProgressHalfHeight: 0.025,
  horizontalProgressSegments: 20,
  horizontalProgressBottomMarginPixels: 24,
  ringElementFamilyCount: 16,
  ringRadiusVariationMaximum: 0.014,
  ringRadiusInstabilityStart: 0.6,
  ringRadiusInstabilityMaximumAt: 0.9,
  stageThreeDepartureDurationSeconds: 0.54,
  stageThreeDepartureStaggerSeconds: 0.0195,
  stageThreeDepartureRadius: 1.25,
  stageThreeDepartureCarrierOverscan: 2.35,
  globalScaleStart: 0.6,
  globalScaleMaximum: 1.1,
  mobileViewportMaximumWidth: 600,
  mobileViewportScale: 1.05,
  exitProgressThreshold: 0.045,
  revealDurationSeconds: 0.93,
});

function smoothstepScalar(minimum: number, maximum: number, value: number) {
  const normalized = THREE.MathUtils.clamp(
    (value - minimum) / (maximum - minimum),
    0,
    1,
  );
  return normalized * normalized * (3 - 2 * normalized);
}

export function sampleFlowerContactHudGlobalScale(progress: number) {
  const scaleProgress = smoothstepScalar(
    FLOWER_CONTACT_HUD.globalScaleStart,
    1,
    progress,
  );
  return THREE.MathUtils.lerp(
    1,
    FLOWER_CONTACT_HUD.globalScaleMaximum,
    scaleProgress,
  );
}

export function sampleFlowerContactHudViewportScale(
  viewportWidth: number,
  viewportHeight: number,
) {
  return viewportWidth <= FLOWER_CONTACT_HUD.mobileViewportMaximumWidth &&
    viewportHeight > viewportWidth
    ? FLOWER_CONTACT_HUD.mobileViewportScale
    : 1;
}

export function calculateFlowerContactHudDiameter(
  targetDepth: number,
  depth: number,
  viewWidth: number,
  viewHeight: number,
) {
  const flowerRelativeDiameter =
    FLOWER_CONTACT_HUD.targetPlaneDiameter * depth / targetDepth;
  const shortSideLimit =
    Math.min(viewWidth, viewHeight) *
    FLOWER_CONTACT_HUD.maximumViewportFraction;
  const viewportLimit = viewWidth > viewHeight
    ? Math.max(
        shortSideLimit,
        viewWidth * FLOWER_CONTACT_HUD.landscapeViewportWidthFraction,
      )
    : shortSideLimit;
  return Math.min(
    flowerRelativeDiameter,
    viewportLimit,
  );
}

export function flowerContactHudStableHash(value: number, seed: number) {
  const signal = Math.sin((value + seed) * 12.9898) * 43758.5453;
  return signal - Math.floor(signal);
}

export function sampleFlowerContactHudRingRadiusOffset(
  progress: number,
  ringIndex: number,
  elapsedSeconds: number,
) {
  const hud = FLOWER_CONTACT_HUD;
  const instability = smoothstepScalar(
    hud.ringRadiusInstabilityStart,
    hud.ringRadiusInstabilityMaximumAt,
    progress,
  );
  if (instability === 0) return 0;
  const frequencyA = 29 + flowerContactHudStableHash(ringIndex, 22.4) * 19;
  const frequencyB = 51 + flowerContactHudStableHash(ringIndex, 74.8) * 23;
  const phaseA = flowerContactHudStableHash(ringIndex, 39.7) * Math.PI * 2;
  const phaseB = flowerContactHudStableHash(ringIndex, 96.3) * Math.PI * 2;
  const noise =
    Math.sin(elapsedSeconds * frequencyA + phaseA) * 0.64 +
    Math.sin(elapsedSeconds * frequencyB + phaseB) * 0.36;
  return noise * hud.ringRadiusVariationMaximum * instability;
}

export function sampleFlowerContactHudStageThreeDeparture(
  elapsedSeconds: number,
  ringIndex: number,
) {
  const hud = FLOWER_CONTACT_HUD;
  const localProgress = THREE.MathUtils.clamp(
    (
      elapsedSeconds -
      ringIndex * hud.stageThreeDepartureStaggerSeconds
    ) / hud.stageThreeDepartureDurationSeconds,
    0,
    1,
  );
  const easedProgress =
    localProgress * 0.22 + localProgress * localProgress * 0.78;
  return {
    progress: localProgress,
    easedProgress,
    radiusOffset: hud.stageThreeDepartureRadius * easedProgress,
    vibrationWeight: 1 - smoothstepScalar(0, 0.45, localProgress),
  };
}
