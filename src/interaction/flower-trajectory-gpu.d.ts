import type * as THREE from 'three/webgpu';
import type { FlowerTrajectoryFrame } from './flower-trajectory';

export type FlowerTrajectoryGpu = {
  rayStorage: any;
  hitStorage: any;
  sampleCountNode: any;
  warmup(renderer: THREE.WebGPURenderer): Promise<void>;
  prepare(
    renderer: THREE.WebGPURenderer,
    frame: FlowerTrajectoryFrame,
  ): void;
  readLatestContact(
    renderer: THREE.WebGPURenderer,
    frame: FlowerTrajectoryFrame,
  ): Promise<{
    revision: number;
    valid: boolean;
    positionX: number;
    positionY: number;
    positionZ: number;
    petalIndex: number;
    cellIndex: number;
    triangleIndex: number;
  } | null>;
  dispose(): void;
};

export function createFlowerTrajectoryGpu(surface: {
  positionStorage: any;
  activePetalCountNode: any;
  gridColumnsNode: any;
  gridVertexCountNode: any;
  gridCellCountNode: any;
  interactionReadinessNode: any;
  interactionMinimumOutnessNode: any;
}): FlowerTrajectoryGpu;
