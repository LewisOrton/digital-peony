import type * as THREE from 'three/webgpu';
import type {
  FlowerTrajectoryFrame,
} from '../interaction/flower-trajectory';

export const INTERACTION_FIELD: Readonly<{
  resolutionScale: number;
  maximumLongEdge: number;
  maximumDeltaSeconds: number;
  expiryEnergy: number;
}>;

export function interactionFieldSize(
  width: number,
  height: number,
): { width: number; height: number };

export type InteractionPostField = {
  textureNode: any;
  readonly texture: THREE.Texture;
  readonly active: boolean;
  prewarm(): Promise<void>;
  update(
    timestamp: number,
    frame: FlowerTrajectoryFrame,
  ): void;
  clear(): void;
  dispose(): void;
};

export function createInteractionPostField(
  renderer: THREE.WebGPURenderer,
  trajectory: FlowerTrajectoryFrame,
): InteractionPostField;
