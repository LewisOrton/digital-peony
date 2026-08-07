import * as THREE from 'three/webgpu';
import { LIVING_FLOWER } from '../simulation/living-flower-contract';
import type {
  LivingFlowerRuntime,
} from '../simulation/living-flower-runtime';
import type {
  FlowerInputModeController,
} from './flower-input-mode';

export type FlowerTrajectoryRay = {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  screenUv: THREE.Vector2;
  timestamp: number;
};

export type FlowerTrajectoryFrame = {
  revision: number;
  validatedRevision: number;
  deposit: boolean;
  held: boolean;
  contactValidated: boolean;
  contactPosition: THREE.Vector3;
  contactPetalIndex: number;
  contactCellIndex: number;
  contactTriangleIndex: number;
  sampleCount: number;
  rays: readonly FlowerTrajectoryRay[];
  timestamp: number;
  cssWidth: number;
  cssHeight: number;
  velocityUvPerSecond: THREE.Vector2;
  pressure: number;
  readiness: number;
  pointerScreenUv: THREE.Vector2;
  pointerInside: boolean;
  rayStorage: any;
  hitStorage: any;
  sampleCountNode: any;
};

export const FLOWER_CONTACT_CAMERA = Object.freeze({
  distanceFraction: 0.1,
  pullInNinetyPercentMilliseconds: 130,
  returnNinetyPercentMilliseconds: 280,
});

export function advanceFlowerContactCameraAmount(
  current: number,
  contactValidated: boolean,
  elapsedSeconds: number,
) {
  const target = contactValidated ? 1 : 0;
  const durationMilliseconds = contactValidated
    ? FLOWER_CONTACT_CAMERA.pullInNinetyPercentMilliseconds
    : FLOWER_CONTACT_CAMERA.returnNinetyPercentMilliseconds;
  const rate = Math.log(10) / (durationMilliseconds / 1000);
  const next = target +
    (current - target) * Math.exp(-rate * elapsedSeconds);
  return Math.abs(next - target) < 0.0001 ? target : next;
}

export function updateInverseFlowerSpace(
  flowerSpace: THREE.Object3D,
  inverseMatrix: THREE.Matrix4,
  inverseQuaternion: THREE.Quaternion,
) {
  flowerSpace.updateWorldMatrix(true, false);
  inverseMatrix.copy(flowerSpace.matrixWorld).invert();
  inverseQuaternion.setFromRotationMatrix(inverseMatrix);
}

export function mapWorldTrajectoryRayToFlowerLocal(
  ray: FlowerTrajectoryRay,
  inverseMatrix: THREE.Matrix4,
  inverseQuaternion: THREE.Quaternion,
) {
  ray.origin.applyMatrix4(inverseMatrix);
  ray.direction.applyQuaternion(inverseQuaternion);
}

export function mapWorldInteractionForceToFlowerLocal(
  worldForce: THREE.Vector3,
  localForce: THREE.Vector3,
  inverseQuaternion: THREE.Quaternion,
) {
  return localForce.copy(worldForce).applyQuaternion(inverseQuaternion);
}

export function isStageThreeHoverPointerType(pointerType: string) {
  return pointerType === 'mouse';
}

export function createFlowerTrajectory(
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
  cameraTarget: THREE.Vector3,
  simulation: LivingFlowerRuntime,
  flowerSpace: THREE.Object3D,
  setSelfRotationPaused: (paused: boolean) => void,
  inputMode: FlowerInputModeController,
  consumePrimaryPointerDown: () => boolean,
) {
  const trajectoryGpu = simulation.trajectoryGpu;
  const zero = new THREE.Vector3();
  const interactionForce = new THREE.Vector3();
  const desiredForce = new THREE.Vector3();
  const localForce = new THREE.Vector3();
  const inverseFlowerMatrix = new THREE.Matrix4();
  const inverseFlowerQuaternion = new THREE.Quaternion();
  const lockedPosition = new THREE.Vector3();
  const lockedTarget = new THREE.Vector3();
  const lockedQuaternion = new THREE.Quaternion();
  const lockedCameraOffset = new THREE.Vector3();
  const lockedCameraRight = new THREE.Vector3();
  const reactiveCameraOffset = new THREE.Vector3();
  const reactiveCameraRight = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const pointer = new THREE.Vector2();
  const desiredCameraOffset = new THREE.Vector2();
  const cameraOffset = new THREE.Vector2();
  const cameraVelocity = new THREE.Vector2();
  const velocityUvPerSecond = new THREE.Vector2();
  const pointerScreenUv = new THREE.Vector2(0.5, 0.5);
  const contactPosition = new THREE.Vector3();
  const rays: FlowerTrajectoryRay[] = Array.from(
    { length: LIVING_FLOWER.maximumBrushSamples },
    () => ({
      origin: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      screenUv: new THREE.Vector2(),
      timestamp: 0,
    }),
  );
  const frame: FlowerTrajectoryFrame = {
    revision: 0,
    validatedRevision: -1,
    deposit: false,
    held: false,
    contactValidated: false,
    contactPosition,
    contactPetalIndex: -1,
    contactCellIndex: -1,
    contactTriangleIndex: -1,
    sampleCount: 0,
    rays,
    timestamp: 0,
    cssWidth: 1,
    cssHeight: 1,
    velocityUvPerSecond,
    pressure: 1,
    readiness: 0,
    pointerScreenUv,
    pointerInside: false,
    rayStorage: trajectoryGpu.rayStorage,
    hitStorage: trajectoryGpu.hitStorage,
    sampleCountNode: trajectoryGpu.sampleCountNode,
  };
  let activePointer: number | null = null;
  let previousX = 0;
  let previousY = 0;
  let previousTime = 0;
  let previousUpdateTime: number | null = null;
  let latestDepositRevision = -1;
  let consumedDepositRevision = -1;
  let deferredTrajectoryClear = false;
  let enabled = false;
  let readiness = 0;
  let disposed = false;
  let contactReadbackPending = false;
  let contactReadbackEpoch = 0;
  let contactCameraAmount = 0;
  let cameraPresentationActive = false;
  const sampleSpacingPixels = 12;
  const maximumCameraYaw = THREE.MathUtils.degToRad(21.6);
  const maximumCameraPitch = THREE.MathUtils.degToRad(13.6);
  const cameraYawRadiansPerPixel = 0.00056;
  const cameraPitchRadiansPerPixel = 0.0004;
  const cameraTrackingSpringFrequency = 8;
  const cameraTrackingSpringDampingRatio = 0.58;
  const cameraReturnSpringFrequency = 20;
  const cameraReturnSpringDampingRatio = 0.9;

  function refreshInverseFlowerSpace() {
    updateInverseFlowerSpace(
      flowerSpace,
      inverseFlowerMatrix,
      inverseFlowerQuaternion,
    );
  }

  function publish(
    sampleCount: number,
    deposit: boolean,
    timestamp: number,
  ) {
    frame.sampleCount = sampleCount;
    frame.held = activePointer !== null;
    frame.timestamp = timestamp;
    if (frame.revision === frame.validatedRevision) {
      frame.revision += 1;
    }
    if (deposit) latestDepositRevision = frame.revision;
  }

  function clearTrajectory(timestamp = performance.now()) {
    localForce.copy(zero);
    simulation.setInteractionForce(localForce);
    velocityUvPerSecond.set(0, 0);
    publish(0, false, timestamp);
  }

  function finishActiveInteraction(
    pointerId: number | null = null,
    timestamp = performance.now(),
  ) {
    if (
      activePointer === null ||
      (pointerId !== null && pointerId !== activePointer)
    ) {
      return false;
    }
    const capturedPointer = activePointer;
    activePointer = null;
    frame.held = false;
    frame.contactValidated = false;
    frame.contactPetalIndex = -1;
    frame.contactCellIndex = -1;
    frame.contactTriangleIndex = -1;
    contactReadbackEpoch += 1;
    setSelfRotationPaused(false);
    if (canvas.hasPointerCapture(capturedPointer)) {
      canvas.releasePointerCapture(capturedPointer);
    }
    canvas.classList.remove('is-petting');
    interactionForce.set(0, 0, 0);
    desiredCameraOffset.set(0, 0);
    cameraVelocity.set(0, 0);
    if (latestDepositRevision !== consumedDepositRevision) {
      deferredTrajectoryClear = true;
    } else {
      clearTrajectory(timestamp);
    }
    return true;
  }

  function setEnabled(nextEnabled: boolean) {
    if (enabled === nextEnabled) return;
    const wasEnabled = enabled;
    const endedInteraction = finishActiveInteraction();
    enabled = nextEnabled;
    inputMode.setPetEnabled(enabled);
    canvas.classList.remove('is-petting');
    previousUpdateTime = null;
    deferredTrajectoryClear = false;
    desiredCameraOffset.set(0, 0);
    cameraOffset.set(0, 0);
    cameraVelocity.set(0, 0);
    contactCameraAmount = 0;
    frame.contactValidated = false;
    frame.contactPetalIndex = -1;
    frame.contactCellIndex = -1;
    frame.contactTriangleIndex = -1;
    contactReadbackEpoch += 1;
    if (!endedInteraction || frame.sampleCount > 0) {
      clearTrajectory();
    }
    if (wasEnabled && !enabled) {
      camera.position.copy(lockedPosition);
      camera.quaternion.copy(lockedQuaternion);
      cameraTarget.copy(lockedTarget);
      camera.updateMatrixWorld();
    }
    if (enabled) {
      lockedPosition.copy(camera.position);
      lockedTarget.copy(cameraTarget);
      camera.position.copy(lockedPosition);
      cameraTarget.copy(lockedTarget);
      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld();
      lockedQuaternion.copy(camera.quaternion);
      lockedCameraOffset.subVectors(lockedPosition, lockedTarget);
      lockedCameraRight
        .setFromMatrixColumn(camera.matrixWorld, 0)
        .normalize();
    }
  }

  function setReadiness(
    nextReadiness: number,
    minimumOutness: number,
  ) {
    readiness = THREE.MathUtils.clamp(nextReadiness, 0, 1);
    frame.readiness = readiness;
    simulation.setRevealReadiness(
      readiness,
      minimumOutness,
    );
    setEnabled(readiness > 0);
  }

  function rearm() {
    setEnabled(false);
    setEnabled(readiness > 0);
  }

  function setCameraPresentationActive(active: boolean) {
    cameraPresentationActive = active;
    contactCameraAmount = 0;
    desiredCameraOffset.set(0, 0);
    cameraOffset.set(0, 0);
    cameraVelocity.set(0, 0);
    previousUpdateTime = null;
  }

  function rayThroughPointer(
    clientX: number,
    clientY: number,
    ray: FlowerTrajectoryRay,
    bounds: DOMRect,
    timestamp: number,
  ) {
    pointer.set(
      ((clientX - bounds.left) / bounds.width) * 2 - 1,
      -((clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    ray.origin.copy(camera.position);
    ray.screenUv.set(
      pointer.x * 0.5 + 0.5,
      pointer.y * 0.5 + 0.5,
    );
    ray.direction
      .set(pointer.x, pointer.y, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    ray.timestamp = timestamp;
    mapWorldTrajectoryRayToFlowerLocal(
      ray,
      inverseFlowerMatrix,
      inverseFlowerQuaternion,
    );
  }

  function pressureForPointer(event: PointerEvent) {
    return event.pointerType === 'mouse'
      ? 1
      : THREE.MathUtils.clamp(event.pressure || 0.5, 0.2, 1);
  }

  function trackPointer(event: PointerEvent) {
    if (!event.isPrimary) return;
    if (!isStageThreeHoverPointerType(event.pointerType)) {
      frame.pointerInside = false;
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    const inside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    frame.pointerInside = inside;
    if (!inside) return;
    pointerScreenUv.set(
      THREE.MathUtils.clamp(
        (event.clientX - bounds.left) / Math.max(bounds.width, 1),
        0,
        1,
      ),
      THREE.MathUtils.clamp(
        1 - (event.clientY - bounds.top) / Math.max(bounds.height, 1),
        0,
        1,
      ),
    );
  }

  function onPointerDown(event: PointerEvent) {
    trackPointer(event);
    if (
      !enabled ||
      activePointer !== null ||
      !event.isPrimary ||
      event.button !== 0
    ) {
      return;
    }
    if (consumePrimaryPointerDown()) {
      event.preventDefault();
      return;
    }
    activePointer = event.pointerId;
    frame.held = true;
    setSelfRotationPaused(true);
    previousX = event.clientX;
    previousY = event.clientY;
    previousTime = event.timeStamp;
    previousUpdateTime = event.timeStamp;
    velocityUvPerSecond.set(0, 0);
    frame.pressure = pressureForPointer(event);
    interactionForce.set(0, 0, 0);
    desiredCameraOffset.copy(cameraOffset);
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-petting');
    const bounds = canvas.getBoundingClientRect();
    refreshInverseFlowerSpace();
    rayThroughPointer(
      event.clientX,
      event.clientY,
      rays[0],
      bounds,
      event.timeStamp,
    );
    mapWorldInteractionForceToFlowerLocal(
      interactionForce,
      localForce,
      inverseFlowerQuaternion,
    );
    localForce.multiplyScalar(readiness);
    simulation.setInteractionForce(localForce);
    publish(1, true, event.timeStamp);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (!enabled || event.pointerId !== activePointer) return;
    if (
      frame.sampleCount > 0 &&
      consumedDepositRevision === latestDepositRevision
    ) {
      frame.sampleCount = 0;
    }
    const elapsed = Math.max(8, event.timeStamp - previousTime);
    const deltaX = event.clientX - previousX;
    const deltaY = event.clientY - previousY;
    const segmentStartX = previousX;
    const segmentStartY = previousY;
    const segmentStartTime = previousTime;
    previousX = event.clientX;
    previousY = event.clientY;
    previousTime = event.timeStamp;
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const velocityX = deltaX / elapsed;
    const velocityY = deltaY / elapsed;
    const bounds = canvas.getBoundingClientRect();
    velocityUvPerSecond
      .set(
        deltaX / Math.max(bounds.width, 1),
        -deltaY / Math.max(bounds.height, 1),
      )
      .multiplyScalar(1000 / elapsed)
      .clampLength(0, 1.25);
    frame.pressure = pressureForPointer(event);
    const response = 1 - Math.exp(-elapsed / 42);
    desiredForce
      .copy(cameraRight)
      .multiplyScalar(velocityX * 0.96)
      .addScaledVector(cameraUp, -velocityY * 0.96)
      .clampLength(0, 0.7);
    interactionForce.lerp(desiredForce, response);
    desiredCameraOffset.set(
      THREE.MathUtils.clamp(
        desiredCameraOffset.x - deltaX * cameraYawRadiansPerPixel,
        -maximumCameraYaw,
        maximumCameraYaw,
      ),
      THREE.MathUtils.clamp(
        desiredCameraOffset.y - deltaY * cameraPitchRadiansPerPixel,
        -maximumCameraPitch,
        maximumCameraPitch,
      ),
    );
    const segmentLength = Math.hypot(deltaX, deltaY);
    const segmentSampleCount = Math.min(
      LIVING_FLOWER.maximumBrushSamples,
      Math.max(1, Math.ceil(segmentLength / sampleSpacingPixels)),
    );
    while (
      frame.sampleCount + segmentSampleCount >
        LIVING_FLOWER.maximumBrushSamples &&
      frame.sampleCount > 1
    ) {
      let compactedCount = 0;
      for (let source = 0; source < frame.sampleCount; source += 2) {
        if (source !== compactedCount) {
          rays[compactedCount].origin.copy(rays[source].origin);
          rays[compactedCount].direction.copy(rays[source].direction);
          rays[compactedCount].screenUv.copy(rays[source].screenUv);
          rays[compactedCount].timestamp = rays[source].timestamp;
        }
        compactedCount += 1;
      }
      frame.sampleCount = compactedCount;
    }
    refreshInverseFlowerSpace();
    const writableSampleCount = Math.min(
      segmentSampleCount,
      LIVING_FLOWER.maximumBrushSamples - frame.sampleCount,
    );
    for (let sample = 0; sample < writableSampleCount; sample += 1) {
      const amount = (sample + 1) / writableSampleCount;
      rayThroughPointer(
        THREE.MathUtils.lerp(segmentStartX, event.clientX, amount),
        THREE.MathUtils.lerp(segmentStartY, event.clientY, amount),
        rays[frame.sampleCount + sample],
        bounds,
        THREE.MathUtils.lerp(
          segmentStartTime,
          event.timeStamp,
          amount,
        ),
      );
    }
    frame.sampleCount += writableSampleCount;
    mapWorldInteractionForceToFlowerLocal(
      interactionForce,
      localForce,
      inverseFlowerQuaternion,
    );
    localForce.multiplyScalar(readiness);
    simulation.setInteractionForce(localForce);
    publish(frame.sampleCount, true, event.timeStamp);
    event.preventDefault();
  }

  function beginFrame(
    renderer: THREE.WebGPURenderer,
    timestamp: number,
  ) {
    const bounds = canvas.getBoundingClientRect();
    frame.cssWidth = Math.max(bounds.width, 1);
    frame.cssHeight = Math.max(bounds.height, 1);
    frame.timestamp = Math.max(frame.timestamp, timestamp);
    frame.deposit =
      latestDepositRevision !== consumedDepositRevision &&
      frame.sampleCount > 0;
    consumedDepositRevision = latestDepositRevision;
    trajectoryGpu.prepare(renderer, frame);
    if (
      frame.held &&
      frame.sampleCount > 0 &&
      !contactReadbackPending
    ) {
      contactReadbackPending = true;
      const epoch = contactReadbackEpoch;
      const depositedContact = frame.deposit;
      void trajectoryGpu
        .readLatestContact(renderer, frame)
        .then((result) => {
          if (
            result !== null &&
            epoch === contactReadbackEpoch &&
            activePointer !== null
          ) {
            if (result.valid) {
              frame.contactValidated = true;
              frame.contactPetalIndex = result.petalIndex;
              frame.contactCellIndex = result.cellIndex;
              frame.contactTriangleIndex = result.triangleIndex;
              frame.contactPosition.set(
                result.positionX,
                result.positionY,
                result.positionZ,
              );
            } else if (depositedContact) {
              frame.contactValidated = false;
              frame.contactPetalIndex = -1;
              frame.contactCellIndex = -1;
              frame.contactTriangleIndex = -1;
            }
          }
        })
        .finally(() => {
          contactReadbackPending = false;
        });
    }
    return frame;
  }

  function completeFrame(timestamp: number) {
    if (
      deferredTrajectoryClear &&
      consumedDepositRevision === latestDepositRevision
    ) {
      deferredTrajectoryClear = false;
      clearTrajectory(timestamp);
      return;
    }
    if (activePointer !== null && enabled) {
      const bounds = canvas.getBoundingClientRect();
      refreshInverseFlowerSpace();
      rayThroughPointer(
        previousX,
        previousY,
        rays[0],
        bounds,
        timestamp,
      );
      mapWorldInteractionForceToFlowerLocal(
        interactionForce,
        localForce,
        inverseFlowerQuaternion,
      );
      localForce.multiplyScalar(readiness);
      simulation.setInteractionForce(localForce);
      velocityUvPerSecond.set(0, 0);
      publish(1, true, timestamp);
    }
  }

  function release(event: PointerEvent) {
    finishActiveInteraction(event.pointerId, event.timeStamp);
  }

  function onBlur() {
    frame.pointerInside = false;
    finishActiveInteraction();
  }

  function onVisibilityChange() {
    if (!document.hidden) return;
    frame.pointerInside = false;
    finishActiveInteraction();
    deferredTrajectoryClear = false;
    if (frame.sampleCount > 0) clearTrajectory();
  }

  function update(now: number) {
    if (disposed || !enabled) return;
    if (cameraPresentationActive) {
      previousUpdateTime = now;
      return;
    }
    const elapsed =
      previousUpdateTime === null
        ? 0
        : Math.min(0.05, Math.max(0, (now - previousUpdateTime) / 1000));
    previousUpdateTime = now;
    if (
      activePointer !== null &&
      elapsed > 0 &&
      interactionForce.lengthSq() > 0
    ) {
      interactionForce.multiplyScalar(
        Math.exp(
          -elapsed * LIVING_FLOWER.interactionForceDecayPerSecond,
        ),
      );
      if (interactionForce.lengthSq() < 0.000001) {
        interactionForce.set(0, 0, 0);
      }
      refreshInverseFlowerSpace();
      mapWorldInteractionForceToFlowerLocal(
        interactionForce,
        localForce,
        inverseFlowerQuaternion,
      );
      localForce.multiplyScalar(readiness);
      simulation.setInteractionForce(localForce);
    }
    if (elapsed > 0) {
      contactCameraAmount = advanceFlowerContactCameraAmount(
        contactCameraAmount,
        frame.contactValidated && activePointer !== null,
        elapsed,
      );
      const springFrequency =
        activePointer === null
          ? cameraReturnSpringFrequency
          : cameraTrackingSpringFrequency;
      const springDampingRatio =
        activePointer === null
          ? cameraReturnSpringDampingRatio
          : cameraTrackingSpringDampingRatio;
      const spring = springFrequency * springFrequency;
      const damping =
        2 * springDampingRatio * springFrequency;
      cameraVelocity.x +=
        ((desiredCameraOffset.x - cameraOffset.x) * spring -
          cameraVelocity.x * damping) *
        elapsed;
      cameraVelocity.y +=
        ((desiredCameraOffset.y - cameraOffset.y) * spring -
          cameraVelocity.y * damping) *
        elapsed;
      cameraOffset.addScaledVector(cameraVelocity, elapsed);
      cameraOffset.set(
        THREE.MathUtils.clamp(
          cameraOffset.x,
          -maximumCameraYaw,
          maximumCameraYaw,
        ),
        THREE.MathUtils.clamp(
          cameraOffset.y,
          -maximumCameraPitch,
          maximumCameraPitch,
        ),
      );
      if (
        activePointer === null &&
        cameraOffset.lengthSq() < 0.0000000001 &&
        cameraVelocity.lengthSq() < 0.0000000001
      ) {
        cameraOffset.set(0, 0);
        cameraVelocity.set(0, 0);
      }
    }
    cameraTarget.copy(lockedTarget);
    const cameraDistanceScale = 1 -
      FLOWER_CONTACT_CAMERA.distanceFraction * contactCameraAmount;
    if (cameraOffset.lengthSq() === 0) {
      camera.position
        .copy(lockedTarget)
        .addScaledVector(lockedCameraOffset, cameraDistanceScale);
      camera.quaternion.copy(lockedQuaternion);
    } else {
      reactiveCameraOffset
        .copy(lockedCameraOffset)
        .applyAxisAngle(worldUp, cameraOffset.x);
      reactiveCameraRight
        .copy(lockedCameraRight)
        .applyAxisAngle(worldUp, cameraOffset.x);
      reactiveCameraOffset.applyAxisAngle(
        reactiveCameraRight,
        cameraOffset.y,
      );
      reactiveCameraOffset.multiplyScalar(cameraDistanceScale);
      camera.position.copy(lockedTarget).add(reactiveCameraOffset);
      camera.lookAt(lockedTarget);
    }
    camera.updateMatrixWorld();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('pointermove', trackPointer, { passive: true });
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    if (disposed) return;
    setEnabled(false);
    disposed = true;
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', release);
    canvas.removeEventListener('pointercancel', release);
    canvas.removeEventListener('lostpointercapture', release);
    window.removeEventListener('pointermove', trackPointer);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    setReadiness,
    rearm,
    setCameraPresentationActive,
    getCameraRestPose() {
      return {
        position: lockedPosition.toArray() as [number, number, number],
        target: lockedTarget.toArray() as [number, number, number],
      };
    },
    cancelActiveInteraction: finishActiveInteraction,
    translateCamera(offset: THREE.Vector3) {
      lockedPosition.add(offset);
      lockedTarget.add(offset);
    },
    frame,
    beginFrame,
    update,
    completeFrame,
    dispose,
  };
}
