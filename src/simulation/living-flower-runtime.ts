import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import {
  deriveLivingFlowerGridLayout,
  LIVING_FLOWER,
  LIVING_FLOWER_MAXIMUM_GRID_CELL_COUNT,
  LIVING_FLOWER_MAXIMUM_GRID_VERTEX_COUNT,
  LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT,
} from './living-flower-contract';
import {
  createLivingFlowerCompute,
  type LivingFlowerCompute,
} from './living-flower-compute';
import {
  type ReadonlyPetalGeometrySettings,
} from '../geometry/petal';
import {
  type FlowerBaseSettings,
} from '../geometry/flower-base';
import {
  type SimulationSettings,
} from './simulation-state';
import type { PetalDeformationInputs } from '../geometry/geometry-contract';
import {
  rebuildLivingFlowerRestState,
  refreshLivingFlowerRenderRestState,
  type LivingFlowerSnapshot,
} from './living-flower-rest-state';
import type {
  FlowerTrajectoryGpu,
} from '../interaction/flower-trajectory-gpu';

export type LivingFlowerRuntime = {
  compute: LivingFlowerCompute;
  directVertexState(
    instanceNode: any,
    gridCoordinateNode: any,
  ): {
    position: any;
    acrossTangent: any;
    alongTangent: any;
    normal: any;
  };
  directVertexPosition(
    instanceNode: any,
    gridCoordinateNode: any,
  ): any;
  directPetalRootPosition(instanceNode: any): any;
  updateSnapshot(snapshot: LivingFlowerSnapshot): void;
  refreshRenderRest(snapshot: LivingFlowerSnapshot): void;
  setInteractionForce(force: THREE.Vector3): void;
  setRevealReadiness(
    readiness: number,
    minimumOutness: number,
  ): void;
  resetToRest(): void;
  readonly trajectoryGpu: FlowerTrajectoryGpu;
  update(
    renderer: THREE.WebGPURenderer,
    now: number,
    runXpbd?: boolean,
  ): void;
  dispose(): void;
};

export function createLivingFlowerRuntime(
  flowerShapeSettings: PetalDeformationInputs,
  petalSettings: ReadonlyPetalGeometrySettings,
  initialSimulationSettings: SimulationSettings,
  initialFlowerBaseSettings: FlowerBaseSettings,
): LivingFlowerRuntime {
  const compute = createLivingFlowerCompute(
    initialSimulationSettings,
    initialFlowerBaseSettings,
  );
  let activePetalCount = 0;
  let simulationTime = 0;
  let accumulator = 0;
  let previousFrameTime: number | null = null;
  const gridLayout = deriveLivingFlowerGridLayout(
    petalSettings.subdivisionsX + 1,
    petalSettings.subdivisionsY + 1,
  );
  const collisionTriangleCount =
    (gridLayout.gridColumns - 1) * (gridLayout.gridRows - 1) * 2;
  if (
    gridLayout.gridVertexCount > LIVING_FLOWER_MAXIMUM_GRID_VERTEX_COUNT ||
    gridLayout.gridCellCount > LIVING_FLOWER_MAXIMUM_GRID_CELL_COUNT ||
    collisionTriangleCount > LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT
  ) {
    throw new Error('Living-flower topology exceeds its GPU capacity.');
  }
  let disposed = false;

  function currentVertexAt(
    instanceNode: any,
    sampleColumn: any,
    sampleRow: any,
  ) {
    const cagePetalOffset = instanceNode.mul(
      compute.gridVertexCountNode,
    );
    const renderPetalOffset = instanceNode.mul(
      compute.renderVertexCountNode,
    );
    const renderIndex = renderPetalOffset
      .add(sampleRow.mul(compute.renderColumnsNode))
      .add(sampleColumn);
    const basePosition =
      compute.renderRestPositionStorage.element(renderIndex).xyz;
    const lowerCageRow = sampleRow
      .div(2)
      .min(compute.gridRowsNode.sub(1));
    const upperCageRow = lowerCageRow
      .add(1)
      .min(compute.gridRowsNode.sub(1));
    const lowerCageIndex = cagePetalOffset
      .add(lowerCageRow.mul(compute.gridColumnsNode))
      .add(sampleColumn);
    const upperCageIndex = cagePetalOffset
      .add(upperCageRow.mul(compute.gridColumnsNode))
      .add(sampleColumn);
    const lowerDelta = compute.positionAStorage
      .element(lowerCageIndex)
      .xyz
      .sub(
        compute.restPositionStorage.element(lowerCageIndex).xyz,
      );
    const upperDelta = compute.positionAStorage
      .element(upperCageIndex)
      .xyz
      .sub(
        compute.restPositionStorage.element(upperCageIndex).xyz,
      );
    const amount = sampleRow
      .sub(lowerCageRow.mul(2))
      .toFloat()
      .mul(0.5);
    return basePosition.add(lowerDelta.mix(upperDelta, amount));
  }

  function directVertexPosition(
    instanceNode: any,
    gridCoordinateNode: any,
  ) {
    return currentVertexAt(
      instanceNode,
      gridCoordinateNode.x.toUint(),
      gridCoordinateNode.y.toUint(),
    );
  }

  function directPetalRootPosition(instanceNode: any) {
    return currentVertexAt(
      instanceNode,
      compute.renderColumnsNode.sub(1).div(2),
      compute.renderRowsNode.mul(0),
    );
  }

  function directVertexState(
    instanceNode: any,
    gridCoordinateNode: any,
  ) {
    const column = gridCoordinateNode.x.toUint();
    const row = gridCoordinateNode.y.toUint();
    const currentAt = (sampleColumn: any, sampleRow: any) =>
      currentVertexAt(instanceNode, sampleColumn, sampleRow);
    const hasLeft = column.greaterThan(0);
    const hasRight = column.add(1).lessThan(
      compute.renderColumnsNode,
    );
    const hasLower = row.greaterThan(0);
    const hasUpper = row.add(1).lessThan(compute.renderRowsNode);
    const leftColumn = hasLeft.select(column.sub(1), column);
    const rightColumn = hasRight.select(
      column.add(1),
      column,
    );
    const lowerRow = hasLower.select(row.sub(1), row);
    const upperRow = hasUpper.select(row.add(1), row);
    const position = currentAt(column, row).toVar();
    const leftPosition = currentAt(leftColumn, row).toVar();
    const rightPosition = currentAt(rightColumn, row).toVar();
    const lowerPosition = currentAt(column, lowerRow).toVar();
    const upperPosition = currentAt(column, upperRow).toVar();
    const upperRightPosition = currentAt(
      rightColumn,
      upperRow,
    ).toVar();
    const lowerLeftPosition = currentAt(
      leftColumn,
      lowerRow,
    ).toVar();
    const fromCenter = (neighbor: any) => neighbor.sub(position);
    const rightDirection = fromCenter(rightPosition);
    const upperRightDirection = fromCenter(upperRightPosition);
    const upperDirection = fromCenter(upperPosition);
    const leftDirection = fromCenter(leftPosition);
    const lowerLeftDirection = fromCenter(lowerLeftPosition);
    const lowerDirection = fromCenter(lowerPosition);
    const acrossTangent = rightPosition
      .sub(leftPosition)
      .normalize();
    const alongTangent = upperPosition
      .sub(lowerPosition)
      .normalize();
    const normal = (vec3 as any)(0)
      .add(rightDirection.cross(upperRightDirection))
      .add(upperRightDirection.cross(upperDirection))
      .add(upperDirection.cross(leftDirection))
      .add(leftDirection.cross(lowerLeftDirection))
      .add(lowerLeftDirection.cross(lowerDirection))
      .add(lowerDirection.cross(rightDirection))
      .normalize();
    return { position, acrossTangent, alongTangent, normal };
  }

  function updateSnapshot(snapshot: LivingFlowerSnapshot) {
    const rebuilt = rebuildLivingFlowerRestState({
      compute,
      snapshot,
      flowerShapeSettings,
    });
    activePetalCount = rebuilt.activePetalCount;
    compute.setActiveDispatchCounts(
      activePetalCount * gridLayout.gridVertexCount,
      activePetalCount * gridLayout.renderVertexCount,
    );
    simulationTime = 0;
    accumulator = 0;
    previousFrameTime = null;
  }

  function refreshRenderRest(snapshot: LivingFlowerSnapshot) {
    refreshLivingFlowerRenderRestState({
      compute,
      snapshot,
      flowerShapeSettings,
    });
  }

  function setInteractionForce(force: THREE.Vector3) {
    compute.interactionForceNode.value.copy(force);
  }

  function setRevealReadiness(
    readiness: number,
    minimumOutness: number,
  ) {
    compute.interactionReadinessNode.value =
      THREE.MathUtils.clamp(readiness, 0, 1);
    compute.interactionMinimumOutnessNode.value =
      THREE.MathUtils.clamp(minimumOutness, 0, 1);
  }

  function resetToRest() {
    const activeParticleCount =
      activePetalCount * gridLayout.gridVertexCount;
    const rest = compute.restPositionStorage.value.array as Float32Array;
    const positionA = compute.positionAStorage.value.array as Float32Array;
    const positionB = compute.positionBStorage.value.array as Float32Array;
    const velocity = compute.velocityStorage.value.array as Float32Array;
    const lambdas =
      compute.constraintLambdaStorage.value.array as Float32Array;
    const deltas =
      compute.constraintDeltaStorage.value.array as Float32Array;
    positionA.set(rest.subarray(0, activeParticleCount * 4));
    positionB.set(rest.subarray(0, activeParticleCount * 4));
    velocity.fill(0, 0, activeParticleCount * 4);
    lambdas.fill(0, 0, activeParticleCount * 8);
    deltas.fill(0, 0, activeParticleCount * 8);
    for (const [storage, componentCount] of [
      [compute.positionAStorage, activeParticleCount * 4],
      [compute.positionBStorage, activeParticleCount * 4],
      [compute.velocityStorage, activeParticleCount * 4],
      [compute.constraintLambdaStorage, activeParticleCount * 8],
      [compute.constraintDeltaStorage, activeParticleCount * 8],
    ] as const) {
      storage.value.clearUpdateRanges();
      storage.value.addUpdateRange(0, componentCount);
      storage.value.needsUpdate = true;
    }
    simulationTime = 0;
    accumulator = 0;
    previousFrameTime = null;
    compute.simulationTimeNode.value = 0;
  }

  function update(
    renderer: THREE.WebGPURenderer,
    now: number,
    runXpbd = true,
  ) {
    if (disposed || activePetalCount === 0) return;
    if (!runXpbd) {
      previousFrameTime = now;
      accumulator = 0;
      return;
    }
    if (previousFrameTime === null) {
      previousFrameTime = now;
      return;
    }
    const elapsed = Math.min(0.05, Math.max(0, (now - previousFrameTime) / 1000));
    previousFrameTime = now;
    accumulator += elapsed;
    let fixedSteps = 0;
    while (
      accumulator >= LIVING_FLOWER.fixedStepSeconds &&
      fixedSteps < LIVING_FLOWER.maximumFrameSteps
    ) {
      simulationTime += LIVING_FLOWER.fixedStepSeconds;
      compute.simulationTimeNode.value = simulationTime;
      renderer.compute(compute.stepComputeNodes);
      accumulator -= LIVING_FLOWER.fixedStepSeconds;
      fixedSteps += 1;
    }
    if (
      fixedSteps === LIVING_FLOWER.maximumFrameSteps &&
      accumulator >= LIVING_FLOWER.fixedStepSeconds
    ) {
      accumulator = Math.min(
        accumulator,
        LIVING_FLOWER.fixedStepSeconds,
      );
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    compute.dispose();
  }

  return {
    compute,
    trajectoryGpu: compute.trajectoryGpu,
    directVertexPosition,
    directPetalRootPosition,
    directVertexState,
    updateSnapshot,
    refreshRenderRest,
    setInteractionForce,
    setRevealReadiness,
    resetToRest,
    update,
    dispose,
  };
}
