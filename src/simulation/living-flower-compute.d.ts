import type {
  FlowerTrajectoryGpu,
} from '../interaction/flower-trajectory-gpu';

export type LivingFlowerCompute = {
  positionAStorage: any;
  positionBStorage: any;
  restPositionStorage: any;
  renderRestPositionStorage: any;
  velocityStorage: any;
  constraintLambdaStorage: any;
  constraintDeltaStorage: any;
  collisionCandidateStorage: any;
  trajectoryGpu: FlowerTrajectoryGpu;
  activePetalCountNode: any;
  gridColumnsNode: any;
  gridRowsNode: any;
  gridVertexCountNode: any;
  gridCellCountNode: any;
  renderColumnsNode: any;
  renderRowsNode: any;
  renderVertexCountNode: any;
  simulationTimeNode: any;
  stepSecondsNode: any;
  turbulenceStrengthNode: any;
  turbulenceScaleNode: any;
  flowerRadiusNode: any;
  turbulenceSpeedNode: any;
  interactionForceNode: any;
  interactionRadiusNode: any;
  interactionReadinessNode: any;
  interactionMinimumOutnessNode: any;
  stepComputeNodes: any[];
  setActiveDispatchCounts(
    activeParticleCount: number,
    activeRenderParticleCount: number,
  ): void;
  dispose(): void;
};

import type { FlowerBaseSettings } from '../geometry/flower-base';
import type { SimulationSettings } from './simulation-state';

export function createLivingFlowerCompute(
  simulationSettings?: SimulationSettings,
  flowerBaseSettings?: FlowerBaseSettings,
): LivingFlowerCompute;
