import { PETAL_GEOMETRY } from '../geometry/geometry-contract';

export function deriveLivingFlowerGridLayout(
  renderColumns: number,
  renderRows: number,
) {
  if (
    !Number.isInteger(renderColumns) ||
    !Number.isInteger(renderRows) ||
    renderColumns < 2 ||
    renderRows < 2
  ) {
    throw new Error(
      'Living-flower simulation requires a render grid of at least 2x2.',
    );
  }
  const gridRows = Math.floor((renderRows - 1) / 2) + 1;
  return {
    renderColumns,
    renderRows,
    renderVertexCount: renderColumns * renderRows,
    gridColumns: renderColumns,
    gridRows,
    gridVertexCount: renderColumns * gridRows,
    gridCellCount: (renderColumns - 1) * (gridRows - 1),
  };
}

const maximumGridColumns =
  PETAL_GEOMETRY.topology.maximumSegmentsX + 1;
const maximumGridRows =
  Math.floor(PETAL_GEOMETRY.topology.maximumSegmentsY / 2) + 1;

export const LIVING_FLOWER = {
  maximumGridColumns,
  maximumGridRows,
  pinnedGridRows: 3,
  maximumPetals: PETAL_GEOMETRY.flowerCapacity.maximumPetals,
  fixedStepSeconds: 1 / 120,
  maximumFrameSteps: 4,
  constraintIterations: 6,
  maximumTipDisplacement: 0.13,
  maximumCollisionCandidates: 4,
  collisionThickness: 0.012,
  collisionSearchRadius: 0.272,
  collisionCorrectionLimit: 0.000375,
  collisionNeighborhoodCells: 1,
  stretchCompliance: 0.0000006,
  shearCompliance: 0.000006,
  curvatureCompliance: 0.000003,
  velocityDampingPerSecond: 8,
  interactionBrushStrength: 225,
  interactionForceDecayPerSecond: 8,
  interactionRadius: 1.08,
  turbulenceAcceleration: 5.2,
  organicReturnAcceleration: 160,
  organicOpennessRadians: 0.018,
  maximumBrushSamples: 32,
} as const;

export const LIVING_FLOWER_MAXIMUM_GRID_VERTEX_COUNT =
  LIVING_FLOWER.maximumGridColumns *
  LIVING_FLOWER.maximumGridRows;
export const LIVING_FLOWER_MAXIMUM_GRID_CELL_COUNT =
  (LIVING_FLOWER.maximumGridColumns - 1) *
  (LIVING_FLOWER.maximumGridRows - 1);
export const LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT =
  PETAL_GEOMETRY.topology.maximumSegmentsX *
  PETAL_GEOMETRY.topology.maximumSegmentsY *
  2;
export const LIVING_FLOWER_MAXIMUM_PARTICLES =
  LIVING_FLOWER.maximumPetals *
  LIVING_FLOWER_MAXIMUM_GRID_VERTEX_COUNT;
export const LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES =
  LIVING_FLOWER.maximumPetals *
  maximumGridColumns *
  (PETAL_GEOMETRY.topology.maximumSegmentsY + 1);
