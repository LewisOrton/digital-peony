import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  float,
  texture,
  uniform,
  uint,
  uv,
  vec2,
  vec4,
} from 'three/tsl';
import { POST_DEFAULTS } from './post-state';

export const INTERACTION_FIELD = Object.freeze({
  resolutionScale: 0.25,
  maximumLongEdge: 640,
  maximumDeltaSeconds: 0.05,
  expiryEnergy: 0.03,
});

export function interactionFieldSize(width, height) {
  const scale = Math.min(
    INTERACTION_FIELD.resolutionScale,
    INTERACTION_FIELD.maximumLongEdge / Math.max(width, height, 1),
  );
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

function configureTarget(target, name) {
  target.texture.name = name;
  target.texture.colorSpace = THREE.NoColorSpace;
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.generateMipmaps = false;
}

export function createInteractionPostField(
  renderer,
  trajectory,
) {
  const targets = [
    new THREE.RenderTarget(1, 1, {
      depthBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    }),
    new THREE.RenderTarget(1, 1, {
      depthBuffer: false,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
    }),
  ];
  targets.forEach((target, index) =>
    configureTarget(target, `InteractionWarp.field${index}`),
  );

  const coordinate = uv();
  const inputTexture = texture(targets[0].texture);
  const outputTexture = texture(targets[0].texture);
  const deltaSeconds = uniform(1 / 60);
  const elapsedSeconds = uniform(0);
  const decayRate = uniform(
    -Math.log(INTERACTION_FIELD.expiryEnergy) /
      POST_DEFAULTS.interactionWarpTrail,
  );
  const radiusShortSide = uniform(
    POST_DEFAULTS.interactionWarpRadiusShortSide,
  );
  const turbulence = uniform(POST_DEFAULTS.interactionWarpTurbulence);
  const depositEnabled = uniform(0);
  const pointerVelocity = uniform(new THREE.Vector2());
  const pressure = uniform(1);
  const readiness = uniform(0);
  const viewportPixels = uniform(new THREE.Vector2(1, 1));
  const fieldTexel = uniform(new THREE.Vector2(1, 1));

  const fieldUpdate = Fn(() => {
    const firstState = inputTexture.sample(coordinate);
    const backtracedUv = coordinate
      .sub(
        firstState.xy
          .mul(deltaSeconds)
          .mul(0.22),
      )
      .clamp(0.001, 0.999);
    const advected = inputTexture.sample(backtracedUv);
    const exponentialDecay = deltaSeconds
      .mul(decayRate)
      .negate()
      .exp();
    const flow = advected.xy.mul(exponentialDecay).toVar();
    const energy = advected.z.mul(exponentialDecay).toVar();
    const spectralPhase = advected.w.toVar();

    const energyLeft = inputTexture
      .sample(backtracedUv.sub(vec2(fieldTexel.x, 0)))
      .z;
    const energyRight = inputTexture
      .sample(backtracedUv.add(vec2(fieldTexel.x, 0)))
      .z;
    const energyDown = inputTexture
      .sample(backtracedUv.sub(vec2(0, fieldTexel.y)))
      .z;
    const energyUp = inputTexture
      .sample(backtracedUv.add(vec2(0, fieldTexel.y)))
      .z;
    const energyGradient = vec2(
      energyRight.sub(energyLeft),
      energyUp.sub(energyDown),
    );
    flow.addAssign(
      vec2(energyGradient.y.negate(), energyGradient.x)
        .mul(turbulence)
        .mul(deltaSeconds)
        .mul(0.04),
    );

    If(depositEnabled.greaterThan(0.5), () => {
      const strongestDeposit = float(0).toVar();
      const strongestPhase = float(0).toVar();
      Loop(
        {
          name: 'sample',
          start: uint(0),
          end: trajectory.sampleCountNode,
          type: 'uint',
          condition: '<',
        },
        ({ sample }) => {
          const rayOffset = sample.mul(uint(2));
          const rayOrigin = trajectory.rayStorage
            .element(rayOffset);
          const rayDirection = trajectory.rayStorage
            .element(rayOffset.add(1));
          const hit = trajectory.hitStorage.element(sample);
          If(hit.w.greaterThan(0), () => {
            const sampleUv = vec2(
              rayOrigin.w,
              float(1).sub(rayDirection.w),
            );
            const pixelDistance = coordinate
              .sub(sampleUv)
              .mul(viewportPixels)
              .length();
            const radiusCssPixels = viewportPixels.x
              .min(viewportPixels.y)
              .mul(radiusShortSide);
            const normalizedDistance = pixelDistance.div(radiusCssPixels);
            If(normalizedDistance.lessThan(1), () => {
              const capsule = normalizedDistance
                .mul(normalizedDistance)
                .mul(-5)
                .exp();
              If(capsule.greaterThan(strongestDeposit), () => {
                strongestDeposit.assign(capsule);
                strongestPhase.assign(
                  sampleUv.x
                    .mul(0.73)
                    .add(sampleUv.y.mul(1.37))
                    .add(elapsedSeconds.mul(0.11))
                    .add(float(sample).mul(0.037))
                    .fract(),
                );
              });
            });
          });
        },
      );

      const speedResponse = pointerVelocity
        .length()
        .div(0.5)
        .clamp(0.28, 1);
      const depositedEnergy = strongestDeposit
        .mul(speedResponse)
        .mul(readiness)
        .mul(pressure.mul(0.35).add(0.65));
      const flowMix = strongestDeposit.mul(0.9);
      flow.assign(flow.mix(pointerVelocity, flowMix));
      energy.assign(energy.max(depositedEnergy).clamp(0, 1));
      spectralPhase.assign(
        spectralPhase.mix(strongestPhase, flowMix),
      );
    });

    const flowLength = flow.length();
    const boundedFlow = flow.mul(
      float(0.9).div(flowLength.max(0.9)),
    );
    return vec4(
      boundedFlow,
      energy.clamp(0, 1),
      spectralPhase.fract(),
    );
  });

  const material = new THREE.NodeMaterial();
  material.name = 'InteractionWarp.fieldUpdate';
  material.fragmentNode = fieldUpdate();
  material.depthTest = false;
  material.depthWrite = false;
  const quad = new THREE.QuadMesh(material);
  quad.name = 'InteractionWarp.fieldUpdate';
  const drawingBufferSize = new THREE.Vector2();
  const previousClearColor = new THREE.Color();
  let readIndex = 0;
  let active = false;
  let activeUntil = 0;
  let previousTimestamp = null;
  let allocatedWidth = 1;
  let allocatedHeight = 1;
  let prewarmReady = false;
  let disposed = false;
  function clearTargets() {
    const previousTarget = renderer.getRenderTarget();
    renderer.getClearColor(previousClearColor);
    const previousAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    for (const target of targets) {
      renderer.setRenderTarget(target);
      renderer.clear();
    }
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousAlpha);
    readIndex = 0;
    inputTexture.value = targets[0].texture;
    outputTexture.value = targets[0].texture;
  }

  function ensureSize() {
    renderer.getDrawingBufferSize(drawingBufferSize);
    const next = interactionFieldSize(
      drawingBufferSize.x,
      drawingBufferSize.y,
    );
    viewportPixels.value.set(
      trajectory.cssWidth,
      trajectory.cssHeight,
    );
    if (
      next.width === allocatedWidth &&
      next.height === allocatedHeight
    ) {
      return;
    }
    allocatedWidth = next.width;
    allocatedHeight = next.height;
    targets.forEach((target) =>
      target.setSize(allocatedWidth, allocatedHeight),
    );
    fieldTexel.value.set(
      1 / allocatedWidth,
      1 / allocatedHeight,
    );
    clearTargets();
  }

  function clear() {
    if (disposed) return;
    if (active || allocatedWidth > 1 || allocatedHeight > 1) {
      clearTargets();
    }
    active = false;
    activeUntil = 0;
    previousTimestamp = null;
  }

  async function prewarm() {
    if (prewarmReady || disposed) return;
    ensureSize();
    deltaSeconds.value = 1 / 60;
    elapsedSeconds.value = 0;
    depositEnabled.value = 0;
    pointerVelocity.value.set(0, 0);
    pressure.value = 0;
    readiness.value = 0;
    inputTexture.value = targets[0].texture;

    const previousTarget = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(targets[1]);
      quad.render(renderer);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }

    clearTargets();
    active = false;
    activeUntil = 0;
    previousTimestamp = null;
    await renderer.backend.device.queue.onSubmittedWorkDone();
    prewarmReady = true;
  }

  function update(timestamp, frame) {
    if (disposed) return;
    if (frame.deposit) {
      active = true;
      activeUntil =
        timestamp + POST_DEFAULTS.interactionWarpTrail * 1000;
    }
    if (!active) return;
    if (timestamp >= activeUntil) {
      clear();
      return;
    }

    ensureSize();
    const dt =
      previousTimestamp === null
        ? 1 / 60
        : Math.min(
            INTERACTION_FIELD.maximumDeltaSeconds,
            Math.max(0, (timestamp - previousTimestamp) / 1000),
          );
    previousTimestamp = timestamp;
    deltaSeconds.value = dt;
    elapsedSeconds.value = timestamp / 1000;
    depositEnabled.value = frame.deposit ? 1 : 0;
    pointerVelocity.value.copy(frame.velocityUvPerSecond);
    pressure.value = frame.pressure;
    readiness.value = frame.readiness;

    const writeIndex = 1 - readIndex;
    inputTexture.value = targets[readIndex].texture;
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(targets[writeIndex]);
    quad.render(renderer);
    renderer.setRenderTarget(previousTarget);
    readIndex = writeIndex;
    outputTexture.value = targets[readIndex].texture;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    material.dispose();
    targets.forEach((target) => target.dispose());
  }

  return {
    textureNode: outputTexture,
    prewarm,
    update,
    clear,
    get texture() {
      return targets[readIndex].texture;
    },
    get active() {
      return active;
    },
    dispose,
  };
}
