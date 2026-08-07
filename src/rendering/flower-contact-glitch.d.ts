import type { FlowerTrajectoryFrame } from '../interaction/flower-trajectory';
import type { FlowerTrajectoryGpu } from '../interaction/flower-trajectory-gpu';

export const FLOWER_CONTACT_GLITCH: {
  readonly radiusShortAxisFraction: number;
  readonly maximumAmplitudeCssPixels: number;
  readonly minimumVisibleAmplitudeCssPixels: number;
  readonly randomUpdatesPerSecond: number;
  readonly minimumAmplitudeRatio: number;
};

export function createFlowerContactGlitch(
  basePositionNode: any,
  trajectory: FlowerTrajectoryGpu,
): {
  positionNode: any;
  update(timestamp: number, frame: FlowerTrajectoryFrame, progress?: number): void;
};
