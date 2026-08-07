import type * as THREE from 'three/webgpu';
import type { CanonicalPetalGeometryResource } from '../runtime/petal-geometry-resource';
import type { LivingFlowerRuntime } from '../simulation/living-flower-runtime';
import type { FlowerAnchor } from '../geometry/flower-base';
import type { FlowerTrajectoryFrame } from '../interaction/flower-trajectory';
import type { FlowerStageThreeMotion } from './flower-stage-three';

export function createFlowerParticles(options: {
  parent: THREE.Object3D;
  geometryResource: CanonicalPetalGeometryResource;
  simulation: LivingFlowerRuntime;
  instances: THREE.InstancedMesh;
  getAnchors(): readonly FlowerAnchor[];
}): {
  begin(): void;
  setContactProgress(progress: number): void;
  setStageThreeProgress(
    progress: number,
    motion: FlowerStageThreeMotion,
  ): void;
  setStageThreeActive(active: boolean): void;
  setStageThreePointer(
    screenUv: THREE.Vector2,
    pointerInside: boolean,
    camera: THREE.PerspectiveCamera,
    cssWidth: number,
    cssHeight: number,
  ): void;
  preparePrewarm(): () => void;
  prewarmInteraction(renderer: THREE.WebGPURenderer): Promise<void>;
  setEmissionElapsedSeconds(elapsedSeconds: number): void;
  stopEmission(): void;
  emitFromTrajectory(
    frame: FlowerTrajectoryFrame,
    camera: THREE.PerspectiveCamera,
  ): void;
  syncAnchors(): void;
  clear(): void;
  update(renderer: THREE.WebGPURenderer, timestamp: number): void;
  dispose(): void;
};
