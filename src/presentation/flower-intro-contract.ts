export const FLOWER_INTRO = {
  emptyLeadSeconds: 0.75,
  cameraMoveSeconds: 1.21625,
  petalOrderSpanSeconds: 1.7625,
  orderExponent: 1.28,
  rootToTipSweepSeconds: 0.86 * (2 / 3),
  revealBandSeconds: 0.11 * (2 / 3),
  coherentSweepAdvanceSeconds: 0.08 * (2 / 3),
  facetSweepAdvanceSeconds: 0.12 * (2 / 3),
  realCatchupDelaySeconds: 0.18 * (2 / 3),
  realCatchupBandSeconds: 0.66 * (2 / 3),
  curvinessBlendSeconds: 0.84 * (2 / 3),
  curvinessStart: -0.5,
  leadingEdgeStretchPetalUnits: 0.17,
  digitalEnergyExponent: 1.65,
  settledFacetOpacityMin: 0.34,
  settledFacetOpacityRange: 0.28,
  boundaryFacetOpacityMin: 0.26,
  boundaryFacetOpacityRange: 0.26,
} as const;

export const FLOWER_INTRO_DURATION_SECONDS =
  FLOWER_INTRO.emptyLeadSeconds +
  FLOWER_INTRO.petalOrderSpanSeconds +
  FLOWER_INTRO.rootToTipSweepSeconds +
  FLOWER_INTRO.realCatchupDelaySeconds +
  FLOWER_INTRO.realCatchupBandSeconds;

export const FLOWER_INTRO_VISIBLE_COMPLETION_SECONDS =
  FLOWER_INTRO.emptyLeadSeconds +
  FLOWER_INTRO.petalOrderSpanSeconds +
  FLOWER_INTRO.rootToTipSweepSeconds +
  FLOWER_INTRO.revealBandSeconds;

export const FLOWER_INTRO_INTERACTION_RAMP_START_SECONDS = Math.max(
  FLOWER_INTRO.emptyLeadSeconds + FLOWER_INTRO.cameraMoveSeconds,
  FLOWER_INTRO_VISIBLE_COMPLETION_SECONDS * 0.5,
);

export const FLOWER_INTRO_MAXIMUM_ACTIVE_DELTA_SECONDS = 0.05;

export type FlowerIntroPhase = 'inactive' | 'intro' | 'living';

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep01(value: number) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

export function flowerIntroCameraProgress(elapsedSeconds: number) {
  const cameraElapsedSeconds =
    elapsedSeconds - FLOWER_INTRO.emptyLeadSeconds;
  if (cameraElapsedSeconds <= 0) return 0;
  if (cameraElapsedSeconds >= FLOWER_INTRO.cameraMoveSeconds) return 1;
  return cameraElapsedSeconds / FLOWER_INTRO.cameraMoveSeconds;
}

export function flowerIntroPetalStartSeconds(outness: number) {
  return (
    FLOWER_INTRO.emptyLeadSeconds +
    FLOWER_INTRO.petalOrderSpanSeconds *
      Math.pow(1 - clamp01(outness), FLOWER_INTRO.orderExponent)
  );
}

export function flowerIntroInteractionReadiness(
  elapsedSeconds: number,
) {
  return smoothstep01(
    (elapsedSeconds - FLOWER_INTRO_INTERACTION_RAMP_START_SECONDS) /
      (FLOWER_INTRO_VISIBLE_COMPLETION_SECONDS -
        FLOWER_INTRO_INTERACTION_RAMP_START_SECONDS),
  );
}

export function flowerIntroInteractionMinimumOutness(
  elapsedSeconds: number,
) {
  const completedOrderProgress = clamp01(
    (elapsedSeconds -
      FLOWER_INTRO.emptyLeadSeconds -
      FLOWER_INTRO.rootToTipSweepSeconds -
      FLOWER_INTRO.revealBandSeconds) /
      FLOWER_INTRO.petalOrderSpanSeconds,
  );
  return (
    1 -
    Math.pow(
      completedOrderProgress,
      1 / FLOWER_INTRO.orderExponent,
    )
  );
}

export function createFlowerIntroTimeline() {
  let phase: FlowerIntroPhase = 'inactive';

  function enter() {
    phase = 'intro';
  }

  function leave() {
    phase = 'inactive';
  }

  function advance(nextElapsedSeconds: number) {
    if (phase !== 'intro') return false;
    if (Math.max(0, nextElapsedSeconds) < FLOWER_INTRO_DURATION_SECONDS) {
      return false;
    }
    phase = 'living';
    return true;
  }

  return {
    enter,
    leave,
    advance,
    get phase() {
      return phase;
    },
  };
}
