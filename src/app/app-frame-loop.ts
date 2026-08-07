import * as THREE from 'three/webgpu';
import {
  isFlowerPetalCorrupted,
  type createFlowerContactSession,
} from '../interaction/flower-contact-session';
import {
  shouldRunFlowerXpbd,
  type createFlowerStageThreePresentation,
} from '../presentation/flower-stage-three';
import type { Lookdev } from '../rendering/lookdev';
import type { createFlowerRuntime } from '../runtime/flower-runtime';
import type {
  FlowerTrajectoryFrame,
  createFlowerTrajectory,
} from '../interaction/flower-trajectory';
import type {
  createFlowerStageThreeCredit,
} from '../ui/flower-stage-three-credit';
import type {
  createFlowerStageThreeBackground,
} from '../rendering/flower-stage-three-background';
import type {
  createFlowerContactHud,
} from '../rendering/flower-contact-hud-runtime';
import type {
  createFlowerIntroPresentation,
} from '../presentation/flower-intro';
import type {
  createInteractionPostField,
} from '../rendering/interaction-post-field.js';
import type { PostProcessing } from '../rendering/post-processing';
import type {
  FrameContext,
  createFrameParticipantRegistry,
} from './animation-contract';

type AppFrameLoopDependencies = {
  renderer: THREE.WebGPURenderer;
  camera: THREE.PerspectiveCamera;
  keyLight: THREE.DirectionalLight;
  lookdev: Lookdev;
  flower: ReturnType<typeof createFlowerRuntime>;
  flowerTrajectory: ReturnType<typeof createFlowerTrajectory>;
  flowerContactSession: ReturnType<typeof createFlowerContactSession>;
  flowerStageThree: ReturnType<typeof createFlowerStageThreePresentation>;
  flowerStageThreeCredit: ReturnType<typeof createFlowerStageThreeCredit>;
  flowerStageThreeBackground: ReturnType<
    typeof createFlowerStageThreeBackground
  >;
  flowerContactHud: ReturnType<typeof createFlowerContactHud>;
  flowerIntro: ReturnType<typeof createFlowerIntroPresentation>;
  interactionField: ReturnType<
    typeof createInteractionPostField
  >;
  postProcessing: PostProcessing;
  frameParticipants: ReturnType<typeof createFrameParticipantRegistry>;
  frameContext: FrameContext;
};

export function createAppFrameLoop(dependencies: AppFrameLoopDependencies) {
  const {
    renderer,
    camera,
    keyLight,
    lookdev,
    flower,
    flowerTrajectory,
    flowerContactSession,
    flowerStageThree,
    flowerStageThreeCredit,
    flowerStageThreeBackground,
    flowerContactHud,
    flowerIntro,
    interactionField,
    postProcessing,
    frameParticipants,
    frameContext,
  } = dependencies;

  function updateFlowerContactStage(
    timestamp: number,
    interactionFrame: FlowerTrajectoryFrame,
  ) {
    if (!flowerStageThree.active) {
      flowerContactSession.update(timestamp, interactionFrame);
    }
    const contactSnapshot = flowerContactSession.snapshot;
    flowerStageThree.update(timestamp, contactSnapshot.progress);
    flowerStageThreeCredit.update(timestamp, flowerStageThree.phase);
    return contactSnapshot;
  }

  function runFrame(timestamp: number) {
    frameContext.timestamp = timestamp;
    lookdev.fineVein.updateTime(timestamp);
    frameParticipants.update(frameContext);

    const interactionFrame = flowerTrajectory.beginFrame(
      renderer,
      timestamp,
    );
    const contactSnapshot = updateFlowerContactStage(
      timestamp,
      interactionFrame,
    );
    lookdev.corruption.update(timestamp, contactSnapshot);
    flower.setCorruptionActive(lookdev.corruption.active);
    flower.particles.setStageThreePointer(
      interactionFrame.pointerScreenUv,
      interactionFrame.pointerInside,
      camera,
      interactionFrame.cssWidth,
      interactionFrame.cssHeight,
    );
    if (
      !flowerStageThree.active &&
      !isFlowerPetalCorrupted(
        contactSnapshot,
        interactionFrame.contactPetalIndex,
      )
    ) {
      flower.particles.emitFromTrajectory(interactionFrame, camera);
    }

    flower.update(
      frameContext,
      shouldRunFlowerXpbd(flowerStageThree.phase),
    );
    const stageThreeSceneActive = flowerStageThree.active;
    flowerStageThreeBackground.update(timestamp, stageThreeSceneActive);
    postProcessing.setStencilSceneActive(stageThreeSceneActive);

    flowerTrajectory.update(timestamp);
    lookdev.interactionMaterial.setContactProgress(contactSnapshot.progress);
    flower.particles.setContactProgress(contactSnapshot.progress);
    flowerContactHud.update(
      timestamp,
      contactSnapshot,
      flowerIntro.interactionReadiness > 0 &&
        (!flowerStageThree.active || flowerStageThree.phase === 'spreading'),
    );
    lookdev.deformation.interactionGlitch.update(
      timestamp,
      interactionFrame,
      contactSnapshot.progress,
    );
    if (!flowerStageThree.active) {
      interactionField.update(timestamp, interactionFrame);
      postProcessing.updateInteractionUniforms(timestamp, interactionFrame);
    }
    flowerTrajectory.completeFrame(timestamp);

    const interactionOverlayActive =
      (interactionField.active || flowerStageThree.active) &&
      flowerIntro.interactionReadiness > 0;
    lookdev.interactionMaterial.setInteractionOverlay(
      interactionField.texture,
      interactionOverlayActive,
      timestamp / 1000,
    );
    flower.setInteractionOverlayActive(interactionOverlayActive);
    postProcessing.render();

    const shadowDepthTexture = keyLight.shadow.map?.depthTexture;
    if (shadowDepthTexture) {
      lookdev.lighting.bindShadowDepthTexture(shadowDepthTexture);
    }
  }

  renderer.setAnimationLoop(runFrame);

  return {
    dispose() {
      renderer.setAnimationLoop(null);
    },
  };
}
