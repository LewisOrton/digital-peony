import * as THREE from 'three/webgpu';
import {
  cameraProjectionMatrix,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  float,
  instanceIndex,
  modelViewMatrix,
  modelWorldMatrixInverse,
  uint,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';

export const FLOWER_CONTACT_GLITCH = Object.freeze({
  radiusShortAxisFraction: 0.18,
  maximumAmplitudeCssPixels: 12,
  globalVibrationStart: 0.6,
  globalVibrationEnd: 0.9,
  maximumGlobalVibrationCssPixels: 5,
  minimumVisibleAmplitudeCssPixels: 0.25,
  randomUpdatesPerSecond: 60,
  minimumAmplitudeRatio: 0.24,
});

export function createFlowerContactGlitch(
  basePositionNode,
  trajectory,
) {
  const elapsedSeconds = uniform(0);
  const held = uniform(0);
  const readiness = uniform(0);
  const pressure = uniform(1);
  const contactProgress = uniform(0);
  const viewportCssPixels = uniform(new THREE.Vector2(1, 1));

  const sampleCount = trajectory.sampleCountNode;
  const hasSample = sampleCount.greaterThan(uint(0));
  const latestSample = hasSample.select(
    sampleCount.sub(uint(1)),
    uint(0),
  );
  const rayOffset = latestSample.mul(uint(2));
  const rayOrigin = trajectory.rayStorage.element(rayOffset);
  const rayDirection = trajectory.rayStorage.element(
    rayOffset.add(uint(1)),
  );
  const hit = trajectory.hitStorage.element(latestSample);
  const contactUv = vec2(rayOrigin.w, rayDirection.w);

  const viewPosition = modelViewMatrix.mul(vec4(basePositionNode, 1));
  const clipPosition = cameraProjectionMatrix.mul(viewPosition);
  const vertexUv = clipPosition.xy
    .div(clipPosition.w)
    .mul(0.5)
    .add(0.5);
  const distanceCssPixels = vertexUv
    .sub(contactUv)
    .mul(viewportCssPixels)
    .length();
  const shortAxisCssPixels = viewportCssPixels.x.min(
    viewportCssPixels.y,
  );
  const radiusCssPixels = shortAxisCssPixels.mul(
    FLOWER_CONTACT_GLITCH.radiusShortAxisFraction,
  );
  const radial = float(1).sub(
    distanceCssPixels.div(radiusCssPixels.max(1)).clamp(0, 1),
  );
  const falloff = radial
    .mul(radial)
    .mul(float(3).sub(radial.mul(2)));

  const petal = float(instanceIndex.add(uint(1)));
  const timeSlice = elapsedSeconds
    .mul(FLOWER_CONTACT_GLITCH.randomUpdatesPerSecond)
    .floor();
  const directionSeed = petal
    .mul(12.9898)
    .add(timeSlice.mul(78.233))
    .sin()
    .mul(43758.5453)
    .fract();
  const amplitudeSeed = petal
    .mul(93.9898)
    .add(timeSlice.mul(67.345))
    .sin()
    .mul(24634.6345)
    .fract();
  const directionAngle = directionSeed.mul(Math.PI * 2);
  const direction = vec2(
    directionAngle.cos(),
    directionAngle.sin(),
  );
  const randomAmplitude = amplitudeSeed
    .mul(1 - FLOWER_CONTACT_GLITCH.minimumAmplitudeRatio)
    .add(FLOWER_CONTACT_GLITCH.minimumAmplitudeRatio);
  const globalVibrationProgress = contactProgress
    .sub(FLOWER_CONTACT_GLITCH.globalVibrationStart)
    .div(
      FLOWER_CONTACT_GLITCH.globalVibrationEnd -
      FLOWER_CONTACT_GLITCH.globalVibrationStart,
    )
    .clamp(0, 1);
  const globalVibrationAmount = globalVibrationProgress
    .mul(globalVibrationProgress)
    .mul(globalVibrationProgress.mul(-2).add(3));
  const blendedFalloff = falloff
    .mul(globalVibrationAmount.oneMinus())
    .add(globalVibrationAmount);
  const contactActive = held
    .mul(readiness)
    .mul(hasSample.select(1, 0))
    .mul(hit.w.greaterThan(0).select(1, 0));
  const rawAmplitudeCssPixels = blendedFalloff
    .mul(
      float(FLOWER_CONTACT_GLITCH.maximumAmplitudeCssPixels)
        .mul(globalVibrationAmount.oneMinus())
        .add(
          FLOWER_CONTACT_GLITCH.maximumGlobalVibrationCssPixels,
        ),
    )
    .mul(pressure.mul(0.35).add(0.65))
    .mul(randomAmplitude)
    .mul(contactActive);
  const amplitudeCssPixels = rawAmplitudeCssPixels
    .greaterThan(
      float(FLOWER_CONTACT_GLITCH.minimumVisibleAmplitudeCssPixels),
    )
    .select(rawAmplitudeCssPixels, float(0));
  const offsetUv = direction
    .mul(amplitudeCssPixels)
    .div(viewportCssPixels);
  const displacedClip = vec4(
    clipPosition.xy.add(offsetUv.mul(2).mul(clipPosition.w)),
    clipPosition.z,
    clipPosition.w,
  );
  const displacedViewHomogeneous =
    cameraProjectionMatrixInverse.mul(displacedClip);
  const displacedViewPosition = displacedViewHomogeneous.xyz.div(
    displacedViewHomogeneous.w,
  );
  const displacedWorldPosition = cameraWorldMatrix.mul(
    vec4(displacedViewPosition, 1),
  );
  const displacedLocalPosition = modelWorldMatrixInverse.mul(
    displacedWorldPosition,
  );

  function update(timestamp, frame, progress = 0) {
    elapsedSeconds.value = timestamp / 1000;
    held.value =
      frame.held && frame.validatedRevision === frame.revision ? 1 : 0;
    readiness.value = frame.readiness;
    pressure.value = frame.pressure;
    viewportCssPixels.value.set(frame.cssWidth, frame.cssHeight);
    contactProgress.value = Math.min(1, Math.max(0, progress));
  }

  return {
    positionNode: displacedLocalPosition.xyz.div(
      displacedLocalPosition.w,
    ),
    update,
  };
}
