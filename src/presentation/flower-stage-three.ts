export const FLOWER_STAGE_THREE = Object.freeze({
  enterDurationSeconds: 2.2,
  returnDurationSeconds: 2.2,
  petalSpreadDurationSeconds: 0.5,
  petalSpreadEnterStartProgress: 0.4,
  petalSpreadStaggerFraction: 0.58,
  petalSpreadDistance: 0.5,
  innerTargetY: 4.455,
  outerTargetY: 0,
  flatBottomPetalCount: 5,
  maximumOutwardDisplacement: 0.5,
  outwardExponent: 1.35,
  rotationRadians: Math.PI,
  rotationStagger: 0.32,
});

export type FlowerStageThreePhase =
  | 'interactive'
  | 'spreading'
  | 'entering'
  | 'tower'
  | 'returning';

export type FlowerStageThreeMotion = {
  phase: FlowerStageThreePhase;
  spreadProgress: number;
  returnProgress: number;
  returnStartProgress: number;
};

export function shouldRunFlowerXpbd(
  phase: FlowerStageThreePhase,
) {
  return phase === 'interactive';
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function easeOutCubic01(value: number) {
  const amount = clamp01(value);
  return 1 - (1 - amount) ** 3;
}

export function sampleFlowerStageThreeReturnProgress(
  returnStartProgress: number,
  returnProgress: number,
) {
  return clamp01(returnStartProgress) *
    (1 - easeOutCubic01(returnProgress));
}

export function createFlowerStageThreePresentation({
  setProgress,
  onSpreadStart,
  onEnter,
  onReturnComplete,
}: {
  setProgress(progress: number, motion: FlowerStageThreeMotion): void;
  onSpreadStart(timestamp: number): void;
  onEnter(timestamp: number): void;
  onReturnComplete(): void;
}) {
  let phase: FlowerStageThreePhase = 'interactive';
  let progress = 0;
  let returnProgress = 0;
  let returnStartProgress = 0;
  let spreadProgress = 0;
  let returnStartSpreadProgress = 0;
  let previousTimestamp: number | null = null;

  function currentProgress() {
    if (phase === 'entering') return easeOutCubic01(progress);
    if (phase === 'tower') return 1;
    if (phase === 'returning') {
      return sampleFlowerStageThreeReturnProgress(
        returnStartProgress,
        returnProgress,
      );
    }
    return 0;
  }

  function currentSpreadProgress() {
    if (phase === 'spreading' || phase === 'entering') {
      return clamp01(spreadProgress);
    }
    if (phase === 'returning') return clamp01(returnStartSpreadProgress);
    return 0;
  }

  function publishProgress() {
    setProgress(currentProgress(), {
      phase,
      spreadProgress: currentSpreadProgress(),
      returnProgress,
      returnStartProgress,
    });
  }

  function update(timestamp: number, contactProgress: number) {
    if (phase === 'interactive') {
      previousTimestamp = timestamp;
      if (contactProgress === 1) {
        phase = 'spreading';
        spreadProgress = 0;
        onSpreadStart(timestamp);
        publishProgress();
      }
      return;
    }
    if (phase === 'spreading') {
      const elapsedSeconds = previousTimestamp === null
        ? 0
        : Math.min(0.05, Math.max(0, (timestamp - previousTimestamp) / 1000));
      previousTimestamp = timestamp;
      spreadProgress = Math.min(
        1,
        spreadProgress + elapsedSeconds /
          FLOWER_STAGE_THREE.petalSpreadDurationSeconds,
      );
      if (
        spreadProgress >= FLOWER_STAGE_THREE.petalSpreadEnterStartProgress
      ) {
        phase = 'entering';
        progress = 0;
        onEnter(timestamp);
      }
      publishProgress();
      return;
    }
    if (phase === 'tower') {
      previousTimestamp = timestamp;
      return;
    }
    const elapsedSeconds = previousTimestamp === null
      ? 0
      : Math.min(0.05, Math.max(0, (timestamp - previousTimestamp) / 1000));
    previousTimestamp = timestamp;
    let completedReturn = false;
    if (phase === 'entering') {
      spreadProgress = Math.min(
        1,
        spreadProgress + elapsedSeconds /
          FLOWER_STAGE_THREE.petalSpreadDurationSeconds,
      );
      progress = Math.min(
        1,
        progress + elapsedSeconds / FLOWER_STAGE_THREE.enterDurationSeconds,
      );
      if (progress === 1) phase = 'tower';
    } else if (phase === 'returning') {
      const returnDuration = returnStartProgress > 0
        ? FLOWER_STAGE_THREE.returnDurationSeconds * returnStartProgress
        : FLOWER_STAGE_THREE.petalSpreadDurationSeconds * Math.max(
          returnStartSpreadProgress,
          Number.EPSILON,
        );
      returnProgress = Math.min(
        1,
        returnProgress + elapsedSeconds / returnDuration,
      );
      if (returnProgress === 1) {
        phase = 'interactive';
        progress = 0;
        completedReturn = true;
      }
    }
    publishProgress();
    if (completedReturn) onReturnComplete();
  }

  function requestReturn() {
    if (phase === 'interactive' || phase === 'returning') return false;
    returnStartProgress = currentProgress();
    returnStartSpreadProgress = currentSpreadProgress();
    returnProgress = 0;
    phase = 'returning';
    previousTimestamp = null;
    publishProgress();
    return true;
  }

  return {
    update,
    requestReturn,
    get phase() {
      return phase;
    },
    get active() {
      return phase !== 'interactive';
    },
  };
}
