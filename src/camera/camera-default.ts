import * as THREE from 'three/webgpu';
import { PETAL_DEFAULTS } from '../geometry/petal';
import { FLOWER_PETAL_BASE_SCALE } from '../geometry/flower-mode';

export type CameraPose = {
  position: [number, number, number];
  target: [number, number, number];
};

export const FLOWER_CAMERA_FOCAL_LENGTH = 50;

export const FLOWER_STAGE_THREE_RESPONSIVE_COMPOSITION = Object.freeze({
  panStartAspect: 0.7,
  panMaximumAspect: 1,
  verticalPanFraction: 0.028,
  desktopDistanceReductionStartAspect: 1,
  desktopDistanceReductionMaximumAspect: 1.6,
  desktopDistanceScale: 0.9,
  uniformFinalDistanceScale: 0.9,
  uniformVerticalFlowerOffset: -0.14,
  filmGauge: 35,
});

export const FLOWER_CAMERA_PIVOT: CameraPose['target'] = [
  0,
  PETAL_DEFAULTS.height * FLOWER_PETAL_BASE_SCALE * 0.5,
  0,
];

export const FLOWER_CAMERA_POSE: CameraPose = {
  position: [
    0.8694904352800376,
    4.430065267262326,
    -3.2264474640543228,
  ],
  target: FLOWER_CAMERA_PIVOT,
};

export const FLOWER_CAMERA_INTRO_START_POSE: CameraPose = {
  position: [0.3255, 1.01812, -1.980125],
  target: FLOWER_CAMERA_PIVOT,
};

export const FLOWER_STAGE_THREE_MOBILE_CAMERA_POSE: CameraPose = {
  position: [0, 5.00345, -8.967],
  target: [0, 2.6, 0],
};

function easeOutCubic01(value: number) {
  const amount = Math.min(1, Math.max(0, value));
  return 1 - Math.pow(1 - amount, 3);
}

export function sampleFlowerCameraIntroPose(
  progress: number,
  targetPose: CameraPose,
): CameraPose {
  const amount = easeOutCubic01(progress);
  for (let index = 0; index < 3; index += 1) {
    targetPose.position[index] = THREE.MathUtils.lerp(
      FLOWER_CAMERA_INTRO_START_POSE.position[index],
      FLOWER_CAMERA_POSE.position[index],
      amount,
    );
    targetPose.target[index] = FLOWER_CAMERA_PIVOT[index];
  }
  return targetPose;
}

export function sampleFlowerStageThreeTargetPose(
  aspect: number,
): CameraPose {
  const stageTarget = new THREE.Vector3().fromArray(
    FLOWER_STAGE_THREE_MOBILE_CAMERA_POSE.target,
  );
  const phoneCameraVector = new THREE.Vector3()
    .fromArray(FLOWER_STAGE_THREE_MOBILE_CAMERA_POSE.position)
    .sub(stageTarget);
  const composition = FLOWER_STAGE_THREE_RESPONSIVE_COMPOSITION;
  const desktopDistanceProgress = THREE.MathUtils.smoothstep(
    aspect,
    composition.desktopDistanceReductionStartAspect,
    composition.desktopDistanceReductionMaximumAspect,
  );
  const desktopDistanceScale = THREE.MathUtils.lerp(
    1,
    composition.desktopDistanceScale,
    desktopDistanceProgress,
  );
  const distanceScale =
    Math.max(1, aspect) *
    desktopDistanceScale *
    composition.uniformFinalDistanceScale;
  const stagePosition = stageTarget.clone().addScaledVector(
    phoneCameraVector,
    distanceScale,
  );
  const panProgress = THREE.MathUtils.smoothstep(
    aspect,
    composition.panStartAspect,
    composition.panMaximumAspect,
  );
  if (panProgress > 0) {
    const forward = stageTarget.clone().sub(stagePosition).normalize();
    const screenRight = new THREE.Vector3()
      .crossVectors(forward, new THREE.Vector3(0, 1, 0))
      .normalize();
    const screenUp = new THREE.Vector3()
      .crossVectors(screenRight, forward)
      .normalize();
    const targetDistance = stagePosition.distanceTo(stageTarget);
    const filmHeight = composition.filmGauge / Math.max(1, aspect);
    const viewHeightAtTarget =
      targetDistance * filmHeight / FLOWER_CAMERA_FOCAL_LENGTH;
    const compositionPan = screenUp.multiplyScalar(
      -viewHeightAtTarget * composition.verticalPanFraction * panProgress,
    );
    stagePosition.add(compositionPan);
    stageTarget.add(compositionPan);
  }
  stagePosition.y += composition.uniformVerticalFlowerOffset;
  stageTarget.y += composition.uniformVerticalFlowerOffset;
  return {
    position: stagePosition.toArray() as CameraPose['position'],
    target: stageTarget.toArray() as CameraPose['target'],
  };
}
