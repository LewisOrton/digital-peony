import * as THREE from 'three/webgpu';
import type {
  FlowerContactSessionSnapshot,
} from '../interaction/flower-contact-session';
import {
  calculateFlowerContactHudDiameter,
  FLOWER_CONTACT_HUD,
  sampleFlowerContactHudGlobalScale,
  sampleFlowerContactHudRingRadiusOffset,
  sampleFlowerContactHudStageThreeDeparture,
  sampleFlowerContactHudViewportScale,
} from './flower-contact-hud-contract';
import {
  createFlowerContactHudMaterial,
} from './flower-contact-hud-material';

export function createFlowerContactHud(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  getTarget: () => THREE.Vector3,
) {
  const {
    material,
    progressBarMaterial,
    nodes: {
      progressNode,
      opacityNode,
      elapsedSecondsNode,
      revealSecondsNode,
      departureRadiusNodes,
      departureLaunchRadiusNodes,
      departureVibrationWeightNodes,
      departureActiveNode,
      departureCarrierOverscanNode,
    },
  } = createFlowerContactHudMaterial();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const progressBarGeometry = new THREE.PlaneGeometry(
    FLOWER_CONTACT_HUD.horizontalProgressCarrierWidth,
    FLOWER_CONTACT_HUD.horizontalProgressCarrierHeight,
  );
  const mesh = new THREE.Mesh(geometry, material);
  const progressBarMesh = new THREE.Mesh(
    progressBarGeometry,
    progressBarMaterial,
  );
  mesh.name = 'Flower Contact HUD';
  progressBarMesh.name = 'Flower Contact Progress Bar';
  mesh.visible = false;
  progressBarMesh.visible = false;
  mesh.frustumCulled = false;
  progressBarMesh.frustumCulled = false;
  mesh.renderOrder = -4;
  progressBarMesh.renderOrder = 4;
  scene.add(mesh);
  scene.add(progressBarMesh);

  const target = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  let revealPhaseSeconds = 0;
  let previousUpdateTimestamp: number | null = null;
  let globalScale = 1;
  let baseOuterRadiusPixels = 0;
  let outerRadiusPixels = 0;
  let stageThreeDepartureElapsedSeconds = 0;
  let stageThreeDepartureActive = false;
  let stageThreeDepartureArmed = true;
  let stageThreeDepartureGlobalScale = 1;
  let stageThreeDeparturePlaneDepth = 1;
  let stageThreeDeparturePlaneScale = 1;
  let stageThreeDeparturePixelsPerCoordinateUnit = 0;
  let stageThreeDepartureCarrierOverscan = 1;
  let stageThreeDepartureBaseOuterRadiusPixels = 0;
  let stageThreeDepartureOuterRadiusPixels = 0;
  let safeAreaBottomPixels = 0;

  function updateSafeAreaBottom() {
    safeAreaBottomPixels = Number.parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--viewport-safe-bottom'),
    );
  }

  updateSafeAreaBottom();
  window.addEventListener('resize', updateSafeAreaBottom);

  function placeProgressBar(
    depth: number,
    scale: number,
    pixelsPerWorldUnit: number,
  ) {
    const carrierHalfHeightPixels =
      FLOWER_CONTACT_HUD.horizontalProgressCarrierHeight * 0.5 *
      scale * pixelsPerWorldUnit;
    const visibleViewportBottom = window.visualViewport
      ? window.visualViewport.offsetTop + window.visualViewport.height
      : window.innerHeight;
    const centerY = visibleViewportBottom -
      FLOWER_CONTACT_HUD.horizontalProgressBottomMarginPixels -
      safeAreaBottomPixels -
      carrierHalfHeightPixels;
    const offsetWorld =
      (centerY - window.innerHeight * 0.5) / pixelsPerWorldUnit;
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    progressBarMesh.position
      .copy(camera.position)
      .addScaledVector(cameraDirection, depth)
      .addScaledVector(cameraUp, -offsetWorld);
    progressBarMesh.quaternion.copy(camera.quaternion);
    progressBarMesh.scale.setScalar(scale);
    progressBarMesh.updateMatrixWorld();
  }

  function clearDeparture(armed: boolean) {
    stageThreeDepartureActive = false;
    stageThreeDepartureArmed = armed;
    stageThreeDepartureElapsedSeconds = 0;
    departureRadiusNodes.forEach((node) => node.value = 0);
    departureLaunchRadiusNodes.forEach((node) => node.value = 0);
    departureVibrationWeightNodes.forEach((node) => node.value = 1);
    departureActiveNode.value = 0;
    departureCarrierOverscanNode.value = 1;
    progressNode.value = 0;
    opacityNode.value = 0;
    elapsedSecondsNode.value = 0;
    revealSecondsNode.value = 0;
    revealPhaseSeconds = 0;
    previousUpdateTimestamp = null;
    mesh.visible = false;
    progressBarMesh.visible = false;
    globalScale = 1;
    baseOuterRadiusPixels = 0;
    outerRadiusPixels = 0;
    stageThreeDepartureGlobalScale = 1;
    stageThreeDeparturePlaneDepth = 1;
    stageThreeDeparturePlaneScale = 1;
    stageThreeDeparturePixelsPerCoordinateUnit = 0;
    stageThreeDepartureCarrierOverscan = 1;
    stageThreeDepartureBaseOuterRadiusPixels = 0;
    stageThreeDepartureOuterRadiusPixels = 0;
  }

  function beginStageThreeDeparture(timestamp: number) {
    if (!stageThreeDepartureArmed || stageThreeDepartureActive) return false;
    const liveProgress = progressNode.value;
    const liveElapsedSeconds = elapsedSecondsNode.value;
    for (
      let index = 0;
      index < FLOWER_CONTACT_HUD.ringElementFamilyCount;
      index += 1
    ) {
      departureLaunchRadiusNodes[index].value =
        sampleFlowerContactHudRingRadiusOffset(
          liveProgress,
          index,
          liveElapsedSeconds,
        );
      departureRadiusNodes[index].value = 0;
      departureVibrationWeightNodes[index].value = 1;
    }
    stageThreeDepartureActive = true;
    stageThreeDepartureArmed = false;
    stageThreeDepartureElapsedSeconds = 0;
    stageThreeDepartureGlobalScale = globalScale;
    stageThreeDeparturePlaneDepth = camera.position.distanceTo(mesh.position);
    stageThreeDeparturePlaneScale = mesh.scale.x;
    stageThreeDeparturePixelsPerCoordinateUnit =
      outerRadiusPixels / FLOWER_CONTACT_HUD.outerRadius;
    stageThreeDepartureCarrierOverscan =
      window.innerWidth > FLOWER_CONTACT_HUD.mobileViewportMaximumWidth
        ? FLOWER_CONTACT_HUD.stageThreeDepartureCarrierOverscan
        : 1;
    stageThreeDepartureBaseOuterRadiusPixels = baseOuterRadiusPixels;
    stageThreeDepartureOuterRadiusPixels = outerRadiusPixels;
    departureActiveNode.value = 1;
    departureCarrierOverscanNode.value =
      stageThreeDepartureCarrierOverscan;
    progressNode.value = 1;
    opacityNode.value = 1;
    mesh.visible = true;
    progressBarMesh.visible = true;
    previousUpdateTimestamp = timestamp;
    return true;
  }

  function preparePrewarm() {
    const previous = {
      meshVisible: mesh.visible,
      progressBarMeshVisible: progressBarMesh.visible,
      stageThreeDepartureActive,
      stageThreeDepartureArmed,
      progress: progressNode.value,
      opacity: opacityNode.value,
      elapsedSeconds: elapsedSecondsNode.value,
      revealSeconds: revealSecondsNode.value,
      departureActive: departureActiveNode.value,
      departureCarrierOverscan: departureCarrierOverscanNode.value,
      departureRadius: departureRadiusNodes.map((node) => node.value),
      departureLaunchRadius: departureLaunchRadiusNodes.map((node) => node.value),
      departureVibrationWeight: departureVibrationWeightNodes.map(
        (node) => node.value,
      ),
    };
    departureActiveNode.value = 1;
    departureCarrierOverscanNode.value = 1;
    progressNode.value = 1;
    opacityNode.value = 1;
    elapsedSecondsNode.value = 0;
    revealSecondsNode.value = 0;
    departureRadiusNodes.forEach((node) => node.value = 0);
    departureLaunchRadiusNodes.forEach((node) => node.value = 0);
    departureVibrationWeightNodes.forEach((node) => node.value = 1);
    stageThreeDepartureActive = true;
    stageThreeDepartureArmed = false;
    mesh.visible = true;
    progressBarMesh.visible = true;
    return () => {
      mesh.visible = previous.meshVisible;
      progressBarMesh.visible = previous.progressBarMeshVisible;
      stageThreeDepartureActive = previous.stageThreeDepartureActive;
      stageThreeDepartureArmed = previous.stageThreeDepartureArmed;
      progressNode.value = previous.progress;
      opacityNode.value = previous.opacity;
      elapsedSecondsNode.value = previous.elapsedSeconds;
      revealSecondsNode.value = previous.revealSeconds;
      departureActiveNode.value = previous.departureActive;
      departureCarrierOverscanNode.value = previous.departureCarrierOverscan;
      departureRadiusNodes.forEach(
        (node, index) => node.value = previous.departureRadius[index],
      );
      departureLaunchRadiusNodes.forEach(
        (node, index) => node.value = previous.departureLaunchRadius[index],
      );
      departureVibrationWeightNodes.forEach(
        (node, index) => node.value = previous.departureVibrationWeight[index],
      );
    };
  }

  function update(
    timestamp: number,
    snapshot: FlowerContactSessionSnapshot,
    enabled: boolean,
  ) {
    const elapsedSeconds = previousUpdateTimestamp === null
      ? 0
      : THREE.MathUtils.clamp(
          (timestamp - previousUpdateTimestamp) / 1000,
          0,
          0.05,
        );
    previousUpdateTimestamp = timestamp;
    if (enabled && snapshot.progress < 1) {
      stageThreeDepartureArmed = true;
    }
    if (stageThreeDepartureActive) {
      stageThreeDepartureElapsedSeconds += elapsedSeconds;
      let departureComplete = true;
      for (
        let index = 0;
        index < FLOWER_CONTACT_HUD.ringElementFamilyCount;
        index += 1
      ) {
        const departure = sampleFlowerContactHudStageThreeDeparture(
          stageThreeDepartureElapsedSeconds,
          index,
        );
        departureRadiusNodes[index].value = departure.radiusOffset;
        departureVibrationWeightNodes[index].value =
          departure.vibrationWeight;
        departureComplete &&= departure.progress === 1;
      }
      if (departureComplete) {
        clearDeparture(false);
        return;
      }
    }
    const assembling =
      enabled &&
      snapshot.progress > FLOWER_CONTACT_HUD.exitProgressThreshold;
    if (!stageThreeDepartureActive) {
      revealPhaseSeconds = snapshot.progress > 0
        ? THREE.MathUtils.clamp(
            revealPhaseSeconds + elapsedSeconds * (assembling ? 1 : -1),
            0,
            FLOWER_CONTACT_HUD.revealDurationSeconds,
          )
        : 0;
    }
    progressNode.value = stageThreeDepartureActive
      ? 1
      : snapshot.progress;
    opacityNode.value = stageThreeDepartureActive ||
      (enabled && snapshot.progress > 0)
      ? 1
      : 0;
    elapsedSecondsNode.value = timestamp / 1000;
    revealSecondsNode.value = revealPhaseSeconds;
    mesh.visible = opacityNode.value > 0.001;
    progressBarMesh.visible = mesh.visible;
    globalScale = stageThreeDepartureActive
      ? stageThreeDepartureGlobalScale
      : sampleFlowerContactHudGlobalScale(snapshot.progress);
    if (!mesh.visible) {
      outerRadiusPixels = 0;
      return;
    }
    camera.getWorldDirection(cameraDirection);
    if (stageThreeDepartureActive) {
      mesh.position
        .copy(camera.position)
        .addScaledVector(cameraDirection, stageThreeDeparturePlaneDepth);
      mesh.quaternion.copy(camera.quaternion);
      const departureViewHeight =
        2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) *
        stageThreeDeparturePlaneDepth;
      const departurePixelsPerWorldUnit =
        window.innerHeight / departureViewHeight;
      if (stageThreeDepartureCarrierOverscan > 1) {
        mesh.scale.setScalar(
          stageThreeDeparturePixelsPerCoordinateUnit /
            departurePixelsPerWorldUnit *
            stageThreeDepartureCarrierOverscan,
        );
      } else {
        mesh.scale.setScalar(stageThreeDeparturePlaneScale);
      }
      baseOuterRadiusPixels = stageThreeDepartureBaseOuterRadiusPixels;
      outerRadiusPixels = stageThreeDepartureOuterRadiusPixels;
      mesh.updateMatrixWorld();
      placeProgressBar(
        stageThreeDeparturePlaneDepth,
        stageThreeDeparturePlaneScale,
        departurePixelsPerWorldUnit,
      );
      return;
    }
    target.copy(getTarget());
    const targetDepth = camera.position.distanceTo(target);
    const depth = targetDepth + FLOWER_CONTACT_HUD.depthBehindTarget;
    mesh.position
      .copy(camera.position)
      .addScaledVector(cameraDirection, depth);
    mesh.quaternion.copy(camera.quaternion);
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * depth;
    const viewWidth = viewHeight * camera.aspect;
    const diameter = calculateFlowerContactHudDiameter(
      targetDepth,
      depth,
      viewWidth,
      viewHeight,
    );
    const baseScale = diameter * 0.5;
    const viewportScale = sampleFlowerContactHudViewportScale(
      window.innerWidth,
      window.innerHeight,
    );
    const pixelsPerWorldUnit = window.innerHeight / viewHeight;
    baseOuterRadiusPixels =
      baseScale * FLOWER_CONTACT_HUD.outerRadius * pixelsPerWorldUnit;
    outerRadiusPixels = baseOuterRadiusPixels * globalScale * viewportScale;
    mesh.scale.setScalar(baseScale * globalScale * viewportScale);
    mesh.updateMatrixWorld();
    placeProgressBar(
      depth,
      baseScale * globalScale * viewportScale,
      pixelsPerWorldUnit,
    );
  }

  function dispose() {
    window.removeEventListener('resize', updateSafeAreaBottom);
    mesh.removeFromParent();
    progressBarMesh.removeFromParent();
    geometry.dispose();
    progressBarGeometry.dispose();
    material.dispose();
    progressBarMaterial.dispose();
  }

  return {
    beginStageThreeDeparture,
    preparePrewarm,
    update,
    reset() {
      clearDeparture(true);
    },
    dispose,
  };
}
