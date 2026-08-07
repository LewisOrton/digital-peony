import type { FrameContext, FrameParticipant } from '../app/animation-contract';
import {
  createFlowerIntroTimeline,
  FLOWER_INTRO_DURATION_SECONDS,
  FLOWER_INTRO_MAXIMUM_ACTIVE_DELTA_SECONDS,
  flowerIntroCameraProgress,
  flowerIntroInteractionMinimumOutness,
  flowerIntroInteractionReadiness,
} from './flower-intro-contract';

type FlowerIntroSurface = {
  rebuildSimulationRest(): void;
  setPresentationMaterials(
    realMaterial: any | null,
    digitalMaterial: any | null,
  ): void;
  particles: {
    begin(): void;
    setEmissionElapsedSeconds(elapsedSeconds: number): void;
    stopEmission(): void;
    clear(): void;
  };
};

type FlowerInteractionMaterial = {
  realMaterial: any;
  digitalMaterial: any;
  setElapsedSeconds(elapsedSeconds: number): void;
};

export function createFlowerIntroPresentation({
  flower,
  introMaterial,
  setLivingInteractionReadiness,
  setCameraIntroProgress,
}: {
  flower: FlowerIntroSurface;
  introMaterial: FlowerInteractionMaterial;
  setLivingInteractionReadiness(
    readiness: number,
    minimumOutness: number,
  ): void;
  setCameraIntroProgress(progress: number): void;
}): FrameParticipant & {
  enterFlower(): void;
  readonly interactionReadiness: number;
} {
  const timeline = createFlowerIntroTimeline();
  let previousTimestamp: number | null = null;
  let elapsedSeconds = 0;
  let emptyFrameSubmitted = false;
  let interactionReadiness = 0;
  let disposed = false;

  function updateInteractionReadiness(nextReadiness: number) {
    interactionReadiness = nextReadiness;
    setLivingInteractionReadiness(
      interactionReadiness,
      flowerIntroInteractionMinimumOutness(elapsedSeconds),
    );
  }

  function enterFlower() {
    if (disposed) return;
    timeline.enter();
    previousTimestamp = null;
    elapsedSeconds = 0;
    emptyFrameSubmitted = false;
    introMaterial.setElapsedSeconds(0);
    flower.particles.begin();
    flower.rebuildSimulationRest();
    flower.setPresentationMaterials(
      introMaterial.realMaterial,
      introMaterial.digitalMaterial,
    );
    setCameraIntroProgress(0);
    interactionReadiness = 0;
    setLivingInteractionReadiness(0, 1);
  }

  function settle() {
    flower.particles.stopEmission();
    introMaterial.setElapsedSeconds(FLOWER_INTRO_DURATION_SECONDS);
    flower.setPresentationMaterials(null, null);
    setCameraIntroProgress(1);
    updateInteractionReadiness(1);
  }

  function leaveFlower() {
    timeline.leave();
    previousTimestamp = null;
    elapsedSeconds = 0;
    emptyFrameSubmitted = false;
    introMaterial.setElapsedSeconds(0);
    flower.particles.clear();
    flower.setPresentationMaterials(null, null);
    setCameraIntroProgress(1);
    interactionReadiness = 0;
    setLivingInteractionReadiness(0, 1);
  }

  function update({ timestamp }: FrameContext) {
    if (disposed || timeline.phase !== 'intro') return;
    if (!emptyFrameSubmitted) {
      emptyFrameSubmitted = true;
      previousTimestamp = null;
      introMaterial.setElapsedSeconds(0);
      setCameraIntroProgress(0);
      return;
    }
    if (previousTimestamp === null) {
      previousTimestamp = timestamp;
      introMaterial.setElapsedSeconds(0);
      setCameraIntroProgress(0);
      return;
    }
    const deltaSeconds = Math.min(
      FLOWER_INTRO_MAXIMUM_ACTIVE_DELTA_SECONDS,
      Math.max(0, (timestamp - previousTimestamp) / 1000),
    );
    previousTimestamp = timestamp;
    elapsedSeconds += deltaSeconds;
    introMaterial.setElapsedSeconds(elapsedSeconds);
    flower.particles.setEmissionElapsedSeconds(
      elapsedSeconds,
    );
    updateInteractionReadiness(
      flowerIntroInteractionReadiness(elapsedSeconds),
    );
    setCameraIntroProgress(
      flowerIntroCameraProgress(elapsedSeconds),
    );
    if (timeline.advance(elapsedSeconds)) settle();
  }

  function dispose() {
    if (disposed) return;
    leaveFlower();
    disposed = true;
  }

  return {
    enterFlower,
    update,
    dispose,
    get interactionReadiness() {
      return interactionReadiness;
    },
  };
}
