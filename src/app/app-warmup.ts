import type * as THREE from 'three/webgpu';
import type { FlowerTrajectoryGpu } from '../interaction/flower-trajectory-gpu';
import type { createInteractionPostField } from '../rendering/interaction-post-field.js';
import type { createFlowerContactHud } from '../rendering/flower-contact-hud-runtime';
import type { createFlowerStageThreeBackground } from '../rendering/flower-stage-three-background';
import type { Lookdev } from '../rendering/lookdev';
import type { PostProcessing } from '../rendering/post-processing';
import type { createFlowerRuntime } from '../runtime/flower-runtime';

type AppWarmupDependencies = {
  renderer: THREE.WebGPURenderer;
  keyLight: THREE.DirectionalLight;
  trajectoryGpu: FlowerTrajectoryGpu;
  interactionField: ReturnType<
    typeof createInteractionPostField
  >;
  flower: ReturnType<typeof createFlowerRuntime>;
  flowerStageThreeBackground: ReturnType<
    typeof createFlowerStageThreeBackground
  >;
  flowerContactHud: ReturnType<typeof createFlowerContactHud>;
  postProcessing: PostProcessing;
  lookdev: Lookdev;
};

export function createAppWarmupProgressReporter() {
  const loader = document.querySelector<HTMLElement>('[data-peony-loader]')!;

  async function finish() {
    loader.getBoundingClientRect();
    loader.dataset.state = 'complete';
    await Promise.all(
      loader.getAnimations().map((animation) => animation.finished),
    );
    loader.remove();
  }

  return {
    finish,
  };
}

export async function prewarmPeonyApp(
  dependencies: AppWarmupDependencies,
) {
  const {
    renderer,
    keyLight,
    trajectoryGpu,
    interactionField,
    flower,
    flowerStageThreeBackground,
    flowerContactHud,
    postProcessing,
    lookdev,
  } = dependencies;
  await trajectoryGpu.warmup(renderer);
  await flower.particles.prewarmInteraction(renderer);
  await interactionField.prewarm();
  const restoreFlower = flower.prepareInteractionOverlayPrewarm();
  try {
    await postProcessing.prewarmStageTwoInteraction();
    const backgroundPrewarm = flowerStageThreeBackground.preparePrewarm();
    const restoreContactHud = flowerContactHud.preparePrewarm();
    const restoreParticles = flower.particles.preparePrewarm();
    try {
      await postProcessing.prewarmStageThree(() => {
        const shadowDepthTexture = keyLight.shadow.map?.depthTexture;
        if (shadowDepthTexture) {
          lookdev.lighting.bindShadowDepthTexture(shadowDepthTexture);
        }
      });
    } finally {
      restoreParticles();
      restoreContactHud();
      backgroundPrewarm.dispose();
    }
  } finally {
    restoreFlower();
  }
}
