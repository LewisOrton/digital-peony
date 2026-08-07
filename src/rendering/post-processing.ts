import * as THREE from 'three/webgpu';
import { pass, uniform, vec4 } from 'three/tsl';
import {
  createChromaticSplitRgb,
  createGlowGraph,
  createInteractionRgb,
} from './post-processing-graphs';
import type { InteractionPostField } from './interaction-post-field';
import { POST_DEFAULTS } from './post-state';
import type {
  FlowerTrajectoryFrame,
} from '../interaction/flower-trajectory';

type TslNode = any;
type CompilableRenderPipeline = THREE.RenderPipeline & {
  _update(): void;
  _quadMesh: THREE.QuadMesh;
};
type QueueBackend = THREE.Backend & {
  device: {
    queue: {
      onSubmittedWorkDone(): Promise<unknown>;
    };
  };
};

export type PostProcessing = {
  render(): void;
  present(): Promise<void>;
  updateInteractionUniforms(
    timestamp: number,
    frame: FlowerTrajectoryFrame,
  ): void;
  prewarmStageTwoInteraction(): Promise<void>;
  prewarmStageThree(finalizeSceneMaterials?: () => void): Promise<void>;
  prewarmSettledStageThree(): Promise<void>;
  setStencilSceneActive(active: boolean): void;
  dispose(): void;
};

export function createPostProcessing(
  renderer: THREE.WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  interactionField: InteractionPostField,
): PostProcessing {
  const postUniform: TslNode = uniform;
  const interactionStrength: TslNode = postUniform(
    POST_DEFAULTS.interactionWarpStrength,
  );
  const interactionTurbulence: TslNode = postUniform(
    POST_DEFAULTS.interactionWarpTurbulence,
  );
  const interactionChromaticity: TslNode = postUniform(
    POST_DEFAULTS.interactionWarpChromaticity,
  );
  const interactionTime: TslNode = postUniform(0);
  const glowStrength: TslNode = postUniform(
    POST_DEFAULTS.glowStrength,
  );
  const glowRadius: TslNode = postUniform(POST_DEFAULTS.glowRadius);
  const glowThreshold: TslNode = postUniform(POST_DEFAULTS.glowThreshold);
  const chromaticSplitStrength: TslNode = postUniform(
    POST_DEFAULTS.chromaticSplitStrength,
  );
  const postViewportCssPixels: TslNode = postUniform(
    new THREE.Vector2(1, 1),
  );
  const suppressionScenePass = pass(scene, camera, {
    stencilBuffer: true,
  });
  const suppressionDepthTexture =
    suppressionScenePass.renderTarget.depthTexture!;
  suppressionDepthTexture.format =
    THREE.DepthStencilFormat;
  suppressionDepthTexture.type =
    THREE.UnsignedInt248Type;
  const suppressionSceneColor: TslNode =
    suppressionScenePass.getTextureNode('output');
  const suppressionOutput: TslNode = vec4(
    suppressionSceneColor.rgb,
    suppressionSceneColor.a,
  );
  const suppressionPipeline = new THREE.RenderPipeline(
    renderer,
    suppressionOutput,
  );

  const effectScenePass = pass(scene, camera);
  const effectSceneColor: TslNode =
    effectScenePass.getTextureNode('output');
  const effectSceneDepth: TslNode =
    effectScenePass.getTextureNode('depth');

  const interactionRgb = createInteractionRgb({
    sceneColor: effectSceneColor,
    sceneDepth: effectSceneDepth,
    fieldTexture: interactionField.textureNode,
    strength: interactionStrength,
    turbulence: interactionTurbulence,
    chromaticity: interactionChromaticity,
    time: interactionTime,
  });
  const chromaticSplitRgb = createChromaticSplitRgb({
    sceneColor: effectSceneColor,
    sceneDepth: effectSceneDepth,
    fieldTexture: interactionField.textureNode,
    baseRgb: interactionRgb,
    strength: chromaticSplitStrength,
    time: interactionTime,
    viewportCssPixels: postViewportCssPixels,
  });
  const glowGraph = createGlowGraph({
    sceneColor: effectSceneColor,
    threshold: glowThreshold,
    radius: glowRadius,
  });
  const glowPipeline = new THREE.RenderPipeline(
    renderer,
    vec4(
      chromaticSplitRgb.add(
        glowGraph.blurred.rgb.mul(glowStrength),
      ),
      effectSceneColor.a,
    ),
  );
  const stencilGlowGraph = createGlowGraph({
    sceneColor: suppressionSceneColor,
    threshold: glowThreshold,
    radius: glowRadius,
  });
  const stencilGlowPipeline = new THREE.RenderPipeline(
    renderer,
    vec4(
      suppressionSceneColor.rgb.add(
        stencilGlowGraph.blurred.rgb.mul(glowStrength),
      ),
      suppressionSceneColor.a,
    ),
  );
  let stencilSceneActive = false;
  let stageTwoInteractionPrewarmReady = false;
  let stageThreePrewarmTarget: THREE.RenderTarget | null = null;
  let stageThreePrewarmReady = false;
  let settledStageThreePrewarmReady = false;
  let disposed = false;

  function updateInteractionUniforms(
    timestamp: number,
    frame: FlowerTrajectoryFrame,
  ) {
    interactionTime.value = timestamp / 1000;
    postViewportCssPixels.value.set(frame.cssWidth, frame.cssHeight);
  }

  async function compilePipeline(pipeline: THREE.RenderPipeline) {
    const compilablePipeline = pipeline as CompilableRenderPipeline;
    compilablePipeline._update();
    const previousToneMapping = renderer.toneMapping;
    const previousOutputColorSpace = renderer.outputColorSpace;
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputColorSpace = THREE.ColorManagement.workingColorSpace;
      await renderer.compileAsync(
        compilablePipeline._quadMesh,
        compilablePipeline._quadMesh.camera,
      );
    } finally {
      renderer.toneMapping = previousToneMapping;
      renderer.outputColorSpace = previousOutputColorSpace;
    }
  }

  async function awaitSubmittedWork() {
    await (renderer.backend as QueueBackend).device.queue
      .onSubmittedWorkDone();
  }

  async function prewarmStageTwoInteraction() {
    if (stageTwoInteractionPrewarmReady) return;
    const previousTarget = renderer.getRenderTarget();
    const previousMRT = renderer.getMRT();
    const previousCanvasVisibility = renderer.domElement.style.visibility;
    try {
      renderer.domElement.style.visibility = 'hidden';
      renderer.setRenderTarget(null);
      renderer.setMRT(null);

      glowPipeline.render();
      await effectScenePass.compileAsync(renderer);
      await compilePipeline(glowPipeline);
      glowPipeline.render();
      await awaitSubmittedWork();
      stageTwoInteractionPrewarmReady = true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT(previousMRT);
      renderer.domElement.style.visibility = previousCanvasVisibility;
    }
  }

  async function prewarmStageThree(finalizeSceneMaterials?: () => void) {
    if (stageThreePrewarmReady) return;
    stageThreePrewarmTarget = stageThreePrewarmTarget ??
      new THREE.RenderTarget(1, 1, {
        depthBuffer: false,
        stencilBuffer: false,
        type: renderer.getOutputBufferType(),
    });
    const previousTarget = renderer.getRenderTarget();
    const previousMRT = renderer.getMRT();
    const previousCanvasVisibility = renderer.domElement.style.visibility;
    try {
      renderer.setRenderTarget(stageThreePrewarmTarget);
      renderer.setMRT(null);
      suppressionPipeline.render();
      stencilGlowPipeline.render();

      // Compile the same default-target route used by the first visible
      // Stage 3 frame without exposing its warm-up output.
      renderer.domElement.style.visibility = 'hidden';
      renderer.setRenderTarget(null);
      renderer.setMRT(null);
      suppressionPipeline.render();
      stencilGlowPipeline.render();

      finalizeSceneMaterials?.();

      // The first render creates the shadow map. Finalizing scene materials can
      // bind that depth texture and invalidate their initial pipelines. Await
      // the finalized scene and full-screen pipelines in their exact targets.
      await suppressionScenePass.compileAsync(renderer);
      await compilePipeline(suppressionPipeline);
      await compilePipeline(stencilGlowPipeline);

      suppressionPipeline.render();
      stencilGlowPipeline.render();
      await awaitSubmittedWork();
      stageThreePrewarmReady = true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT(previousMRT);
      renderer.domElement.style.visibility = previousCanvasVisibility;
    }
  }

  async function prewarmSettledStageThree() {
    if (settledStageThreePrewarmReady) return;
    const previousTarget = renderer.getRenderTarget();
    const previousMRT = renderer.getMRT();
    try {
      renderer.setRenderTarget(null);
      renderer.setMRT(null);
      await suppressionScenePass.compileAsync(renderer);
      await compilePipeline(suppressionPipeline);
      await compilePipeline(stencilGlowPipeline);
      await awaitSubmittedWork();
      settledStageThreePrewarmReady = true;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setMRT(previousMRT);
    }
  }

  function setStencilSceneActive(active: boolean) {
    stencilSceneActive = active;
  }

  function render() {
    if (stencilSceneActive) {
      stencilGlowPipeline.render();
    } else {
      glowPipeline.render();
    }
  }

  async function present() {
    render();
    await awaitSubmittedWork();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    glowPipeline.dispose();
    stencilGlowPipeline.dispose();
    suppressionPipeline.dispose();
    effectScenePass.dispose();
    suppressionScenePass.dispose();
    glowGraph.blurred.dispose();
    glowGraph.extractionTexture.dispose();
    stencilGlowGraph.blurred.dispose();
    stencilGlowGraph.extractionTexture.dispose();
    stageThreePrewarmTarget?.dispose();
  }

  return {
    render,
    present,
    setStencilSceneActive,
    updateInteractionUniforms,
    prewarmStageTwoInteraction,
    prewarmStageThree,
    prewarmSettledStageThree,
    dispose,
  };
}
