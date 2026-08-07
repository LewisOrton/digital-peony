import * as THREE from 'three/webgpu';
import {
  createPetalDetailTextureRecipe,
  PETAL_DETAIL_TEXTURE_ID,
} from '../rendering/petal-detail-texture-bake';
import {
  createPetalAlbedoGrainRecipe,
  PETAL_ALBEDO_GRAIN,
} from '../rendering/petal-albedo-grain';
import { bakePetalTextureBatch } from '../rendering/petal-texture-batch';
import {
  createPetalBroadTextureRecipe,
  PETAL_BROAD_TEXTURE,
} from '../rendering/petal-broad-texture-bake';
import { createFlowerRuntime } from '../runtime/flower-runtime';
import {
  createFrameParticipantRegistry,
  createFrameTaskCoalescer,
} from './animation-contract';
import {
  createPostProcessing,
} from '../rendering/post-processing';
import { createDemoState } from '../state/state';
import {
  createKeyLight,
  createLookdev,
  type Lookdev,
} from '../rendering/lookdev';
import { createRendererHost } from '../rendering/renderer-lifecycle';
import { createViewport } from '../camera/viewport';
import { createFlowerTrajectory } from '../interaction/flower-trajectory';
import { createFlowerInputMode } from '../interaction/flower-input-mode';
import {
  createCanonicalPetalGeometryResource,
} from '../runtime/petal-geometry-resource';
import { createFlowerIntroPresentation } from '../presentation/flower-intro';
import {
  createInteractionPostField,
} from '../rendering/interaction-post-field.js';
import { createFlowerStageThreeCredit } from '../ui/flower-stage-three-credit';
import {
  createFlowerContactSession,
} from '../interaction/flower-contact-session';
import { createFlowerContactHud } from '../rendering/flower-contact-hud-runtime';
import {
  createFlowerStageThreePresentation,
} from '../presentation/flower-stage-three';
import {
  createFlowerStageThreeBackground,
} from '../rendering/flower-stage-three-background';
import { createAppFrameLoop } from './app-frame-loop';
import {
  createAppControls,
  type AppActions,
} from './app-controls';
import { createGithubSignature } from '../ui/github-signature';
import {
  createAppWarmupProgressReporter,
  prewarmPeonyApp,
} from './app-warmup';

export type PeonyApp = {
  dispose(): void;
};

export async function createPeonyApp(): Promise<PeonyApp> {
  const warmupProgress = createAppWarmupProgressReporter();
  const host = await createRendererHost();
  const {
    app,
    renderer,
    scene,
    dispose: disposeRendererHost,
  } = host;
  const state = createDemoState();
  const githubSignature = createGithubSignature();
  app.append(githubSignature);
  const broadTextureBake = createPetalBroadTextureRecipe(
    state.flowerBase.anchorCount,
  );
  const textureBatch = bakePetalTextureBatch(
    renderer,
    [
      createPetalDetailTextureRecipe(),
      createPetalAlbedoGrainRecipe(),
      broadTextureBake.recipe,
    ],
  );
  const petalDetailTexture = textureBatch.texture(
    PETAL_DETAIL_TEXTURE_ID,
  );
  const albedoGrainTexture = textureBatch.texture(
    PETAL_ALBEDO_GRAIN.id,
  );
  const broadTexture = textureBatch.texture(
    PETAL_BROAD_TEXTURE.id,
  ) as THREE.StorageArrayTexture;
  const keyLight = createKeyLight();
  let lookdev: Lookdev;
  try {
    lookdev = createLookdev(keyLight, state, {
      fineVein: petalDetailTexture,
      bump: petalDetailTexture,
      albedoGrain: albedoGrainTexture,
      broad: broadTexture,
    });
  } catch (error) {
    textureBatch.dispose();
    disposeRendererHost();
    throw error;
  }
  const {
    curviness: curvinessNode,
  } = lookdev.deformation.uniforms;
  const backlightStrengthNode = lookdev.lighting.backlightStrength;
  const rimLightStrengthNode = lookdev.lighting.rimLightStrength;
  const petalGeometry =
    createCanonicalPetalGeometryResource(state.petal);
  const flower = createFlowerRuntime(
    scene,
    petalGeometry,
    lookdev,
    state.flowerBase,
    state.flower,
  );
  const viewport = createViewport(
    scene,
    renderer,
    keyLight,
    lookdev,
  );
  const { camera, target: cameraTarget } = viewport;
  const flowerInputMode = createFlowerInputMode(
    renderer.domElement,
  );
  const flowerContactSession = createFlowerContactSession();
  const flowerContactHud = createFlowerContactHud(
    scene,
    camera,
    () => cameraTarget,
  );
  const flowerStageThreeBackground = createFlowerStageThreeBackground(
    scene,
    camera,
    keyLight,
    backlightStrengthNode,
    rimLightStrengthNode,
    () => cameraTarget,
    state.backgroundPetals,
    state.petal,
    state.flower,
  );
  let postProcessing: ReturnType<typeof createPostProcessing>;
  let flowerTrajectory: ReturnType<typeof createFlowerTrajectory>;
  let parameterControls: { dispose(): void } | null = null;
  const flowerStageThreeCredit = createFlowerStageThreeCredit(app);
  const flowerStageThree = createFlowerStageThreePresentation({
    setProgress(progress, motion) {
      lookdev.deformation.setFlowerStageThreeProgress(progress, motion);
      lookdev.interactionMaterial.setStageThreeProgress(progress);
      flower.particles.setStageThreeProgress(progress, motion);
      viewport.setFlowerStageThreeProgress(progress, motion);
      flowerStageThreeBackground.setProgress(progress, motion);
    },
    onSpreadStart() {
      lookdev.deformation.simulation.resetToRest();
      flowerTrajectory.setCameraPresentationActive(true);
    },
    onEnter(timestamp) {
      flowerStageThreeCredit.begin(timestamp);
      interactionField.clear();
      flowerStageThreeBackground.begin(timestamp);
      flowerContactHud.beginStageThreeDeparture(timestamp);
      flowerContactSession.reset();
      flowerTrajectory.cancelActiveInteraction();
      viewport.beginFlowerStageThree(
        flowerTrajectory.getCameraRestPose(),
      );
      flower.particles.setStageThreeActive(true);
      flowerInputMode.setStageThreeActive(true);
    },
    onReturnComplete() {
      flowerStageThreeCredit.reset();
      flower.particles.setStageThreeActive(false);
      flowerContactSession.reset();
      flowerTrajectory.setCameraPresentationActive(false);
      flowerInputMode.setStageThreeActive(false);
      flowerTrajectory.rearm();
      mountParameters();
    },
  });
  flowerTrajectory = createFlowerTrajectory(
    renderer.domElement,
    camera,
    cameraTarget,
    lookdev.deformation.simulation,
    flower.interactionSpace,
    flower.setInteractionActive,
    flowerInputMode,
    () => {
      if (!flowerStageThree.active) return false;
      if (flowerStageThree.requestReturn()) {
        flowerStageThreeCredit.reset();
        flower.particles.setStageThreeActive(false);
      }
      return true;
    },
  );
  const interactionField =
    createInteractionPostField(
      renderer,
      flowerTrajectory.frame,
    );
  postProcessing = createPostProcessing(
    renderer,
    scene,
    camera,
    interactionField,
  );
  await prewarmPeonyApp(
    {
      renderer,
      keyLight,
      trajectoryGpu: lookdev.deformation.simulation.trajectoryGpu,
      interactionField,
      flower,
      flowerStageThreeBackground,
      flowerContactHud,
      postProcessing,
      lookdev,
    },
  );
  const flowerIntro = createFlowerIntroPresentation({
    flower,
    introMaterial: lookdev.interactionMaterial,
    setLivingInteractionReadiness: (readiness, minimumOutness) => {
      flowerTrajectory.setReadiness(readiness, minimumOutness);
    },
    setCameraIntroProgress: viewport.setFlowerIntroProgress,
  });
  const frameParticipants = createFrameParticipantRegistry();
  frameParticipants.add(flowerIntro);
  const frameContext = { renderer, scene, camera, timestamp: 0 };

  function mountParameters() {
    if (parameterControls) return;
    const updateCurviness = () => {
      curvinessNode.value = state.flower.curviness;
    };
    const rebakePetalBroadTexture = () => {
      textureBatch.rebake(PETAL_BROAD_TEXTURE.id);
    };
    const flowerPlacementRebuild = createFrameTaskCoalescer(() => {
      flower.updatePlacement(false);
      flower.refreshSimulationRenderRest();
    });
    const flowerUniformUpdate = createFrameTaskCoalescer(() => {
      updateCurviness();
      flower.refreshSimulationRenderRest();
    });
    const simulationRestRebuild = createFrameTaskCoalescer(() => {
      updateCurviness();
      flower.rebuildSimulationRest();
    });
    const petalBroadTextureRebake = createFrameTaskCoalescer(
      rebakePetalBroadTexture,
    );
    const flowerBaseRebuild = createFrameTaskCoalescer(() => {
      if (broadTextureBake.setAnchorCount(state.flowerBase.anchorCount)) {
        rebakePetalBroadTexture();
      }
      flower.rebuildBase(false);
      flower.updatePlacement(false);
      flower.refreshSimulationRenderRest();
    });
    const actions: AppActions = {
      updateFlowerPlacement: flowerPlacementRebuild.request,
      updateFlowerShape: flowerUniformUpdate.request,
      updateFlowerRestState: simulationRestRebuild.request,
      updateFlowerBase: flowerBaseRebuild.request,
      updatePetalGradient(stops) {
        if (!broadTextureBake.setGradientStops(stops)) return;
        petalBroadTextureRebake.request();
      },
    };
    const appControls = createAppControls(app, state, actions);
    parameterControls = {
      dispose() {
        appControls.dispose();
        flowerPlacementRebuild.dispose();
        flowerUniformUpdate.dispose();
        simulationRestRebuild.dispose();
        flowerBaseRebuild.dispose();
        petalBroadTextureRebake.dispose();
      },
    };
    appControls.reveal();
  }

  flower.rebuildBase();
  flowerIntro.enterFlower();

  function updateIntroScreenSpaceMetrics() {
    const canvas = renderer.domElement;
    lookdev.interactionMaterial.setScreenSpaceMetrics(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      canvas.width,
      canvas.height,
    );
  }

  function resize() {
    flowerTrajectory.translateCamera(viewport.resize());
    updateIntroScreenSpaceMetrics();
  }

  updateIntroScreenSpaceMetrics();
  window.addEventListener('resize', resize);
  const clearHiddenInteraction = () => {
    if (!document.hidden) return;
    interactionField.clear();
  };
  document.addEventListener(
    'visibilitychange',
    clearHiddenInteraction,
  );

  await postProcessing.present();
  const restoreSettledStageThreeFlower =
    flower.prepareInteractionOverlayPrewarm();
  try {
    await postProcessing.prewarmSettledStageThree();
  } finally {
    restoreSettledStageThreeFlower();
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await warmupProgress.finish();
  const appFrameLoop = createAppFrameLoop({
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
  });

  function dispose() {
    appFrameLoop.dispose();
    flowerTrajectory.dispose();
    flowerContactSession.dispose();
    flowerContactHud.dispose();
    flowerStageThreeCredit.dispose();
    githubSignature.remove();
    flowerStageThreeBackground.dispose();
    parameterControls?.dispose();
    window.removeEventListener('resize', resize);
    document.removeEventListener(
      'visibilitychange',
      clearHiddenInteraction,
    );
    flower.dispose();
    frameParticipants.dispose();
    postProcessing.dispose();
    lookdev.dispose();
    interactionField.dispose();
    textureBatch.dispose();
    petalGeometry.dispose();
    disposeRendererHost();
  }

  return { dispose };
}
