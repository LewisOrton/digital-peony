import * as THREE from 'three/webgpu';
import type { FlowerAnchor } from '../geometry/flower-base';
import {
  deformFlowerPetalPointWithWrinkle,
  stableCreasePhase,
} from '../geometry/flower-mode';
import {
  deriveLivingFlowerGridLayout,
  LIVING_FLOWER,
} from './living-flower-contract';
import type { LivingFlowerCompute } from './living-flower-compute';
import {
  rebuildLivingFlowerCollisionState,
} from './living-flower-collision';
import {
  PETAL_GEOMETRY,
  type ActivePetalTopology,
  type PetalDeformationInputs,
} from '../geometry/geometry-contract';

export type LivingFlowerSnapshot = {
  anchors: readonly FlowerAnchor[];
  flowerRadius: number;
  geometry: THREE.BufferGeometry;
  topology: ActivePetalTopology;
  instances: THREE.InstancedMesh;
};

export type LivingFlowerRestState = {
  activePetalCount: number;
};

export function refreshLivingFlowerRenderRestState({
  compute,
  flowerShapeSettings,
  snapshot: {
    anchors,
    geometry,
    topology,
    instances,
  },
}: {
  compute: LivingFlowerCompute;
  flowerShapeSettings: PetalDeformationInputs;
  snapshot: LivingFlowerSnapshot;
}) {
  const positionAttribute = geometry.getAttribute('position');
  const uvAttribute = geometry.getAttribute('uv');
  const shapeAttribute = geometry.getAttribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
  );
  const {
    renderColumns,
    renderRows,
    vertexCount,
  } = topology;
  const gridLayout = deriveLivingFlowerGridLayout(
    renderColumns,
    renderRows,
  );
  const renderRestArray =
    compute.renderRestPositionStorage.value.array as Float32Array;
  const matrix = new THREE.Matrix4();
  const source = new THREE.Vector3();
  const world = new THREE.Vector3();

  for (const anchor of anchors) {
    instances.getMatrixAt(anchor.index, matrix);
    const phase = stableCreasePhase(anchor.index);
    for (let renderRow = 0; renderRow < renderRows; renderRow += 1) {
      for (
        let renderColumn = 0;
        renderColumn < renderColumns;
        renderColumn += 1
      ) {
        const vertex = renderRow * renderColumns + renderColumn;
        source.fromBufferAttribute(positionAttribute, vertex);
        world
          .copy(
            deformFlowerPetalPointWithWrinkle(
              source,
              uvAttribute.getX(vertex),
              shapeAttribute.getX(vertex),
              uvAttribute.getY(vertex),
              phase,
              flowerShapeSettings.curviness,
              flowerShapeSettings.creaseFrequency,
              flowerShapeSettings.creaseAmplitude,
              flowerShapeSettings.wrinkleFrequency,
              flowerShapeSettings.wrinkleAmplitude,
            ),
          )
          .applyMatrix4(matrix);
        const renderParticle =
          anchor.index * vertexCount + vertex;
        const renderOffset = renderParticle * 4;
        renderRestArray[renderOffset] = world.x;
        renderRestArray[renderOffset + 1] = world.y;
        renderRestArray[renderOffset + 2] = world.z;
        renderRestArray[renderOffset + 3] = 1;
      }
    }
  }

  const componentCount = anchors.length * vertexCount * 4;
  compute.renderRestPositionStorage.value.clearUpdateRanges();
  compute.renderRestPositionStorage.value.addUpdateRange(
    0,
    componentCount,
  );
  compute.renderRestPositionStorage.value.needsUpdate = true;
  return { activePetalCount: anchors.length, gridLayout };
}

export function rebuildLivingFlowerRestState({
  compute,
  flowerShapeSettings,
  snapshot: {
    anchors,
    flowerRadius,
    geometry,
    topology,
    instances,
  },
}: {
  compute: LivingFlowerCompute;
  flowerShapeSettings: PetalDeformationInputs;
  snapshot: LivingFlowerSnapshot;
}): LivingFlowerRestState {
  const { renderColumns, renderRows } = topology;
  const { activePetalCount, gridLayout } =
    refreshLivingFlowerRenderRestState({
      compute,
      flowerShapeSettings,
      snapshot: {
        anchors,
        flowerRadius,
        geometry,
        topology,
        instances,
      },
    });
  const {
    gridColumns,
    gridRows,
    gridVertexCount,
    gridCellCount,
    renderVertexCount,
  } = gridLayout;
  const restArray =
    compute.restPositionStorage.value.array as Float32Array;
  const renderRestArray =
    compute.renderRestPositionStorage.value.array as Float32Array;
  const positionA =
    compute.positionAStorage.value.array as Float32Array;
  const positionB =
    compute.positionBStorage.value.array as Float32Array;
  const velocity =
    compute.velocityStorage.value.array as Float32Array;
  const constraintLambdas =
    compute.constraintLambdaStorage.value.array as Float32Array;
  const constraintDeltas =
    compute.constraintDeltaStorage.value.array as Float32Array;
  const activeParticleCount =
    activePetalCount * gridVertexCount;
  velocity.fill(0, 0, activeParticleCount * 4);
  constraintLambdas.fill(0, 0, activeParticleCount * 8);
  constraintDeltas.fill(0, 0, activeParticleCount * 8);

  for (const anchor of anchors) {
    for (let renderRow = 0; renderRow < renderRows; renderRow += 1) {
      if (renderRow % 2 !== 0) continue;
      for (
        let renderColumn = 0;
        renderColumn < renderColumns;
        renderColumn += 1
      ) {
        const vertex =
          renderRow * renderColumns + renderColumn;
        const renderParticle =
          anchor.index * renderVertexCount + vertex;
        const renderOffset = renderParticle * 4;
        const gridRow = renderRow / 2;
        const particle =
          anchor.index * gridVertexCount +
          gridRow * gridColumns +
          renderColumn;
        const offset = particle * 4;
        const inverseMass =
          gridRow < LIVING_FLOWER.pinnedGridRows ? 0 : 1;
        restArray[offset] = renderRestArray[renderOffset];
        restArray[offset + 1] = renderRestArray[renderOffset + 1];
        restArray[offset + 2] = renderRestArray[renderOffset + 2];
        restArray[offset + 3] = inverseMass;
        positionA[offset] = renderRestArray[renderOffset];
        positionA[offset + 1] = renderRestArray[renderOffset + 1];
        positionA[offset + 2] = renderRestArray[renderOffset + 2];
        positionA[offset + 3] = inverseMass;
        positionB[offset] = renderRestArray[renderOffset];
        positionB[offset + 1] = renderRestArray[renderOffset + 1];
        positionB[offset + 2] = renderRestArray[renderOffset + 2];
        positionB[offset + 3] = inverseMass;
      }
    }
  }

  compute.activePetalCountNode.value = activePetalCount;
  compute.gridColumnsNode.value = gridColumns;
  compute.gridRowsNode.value = gridRows;
  compute.gridVertexCountNode.value = gridVertexCount;
  compute.gridCellCountNode.value = gridCellCount;
  compute.renderColumnsNode.value = renderColumns;
  compute.renderRowsNode.value = renderRows;
  compute.renderVertexCountNode.value = renderVertexCount;
  compute.flowerRadiusNode.value = flowerRadius;
  rebuildLivingFlowerCollisionState({
    compute,
    activePetalCount,
    gridColumns,
    gridRows,
    renderColumns,
    renderRows,
  });
  for (const [storage, componentCount] of [
    [compute.restPositionStorage, activeParticleCount * 4],
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
  compute.simulationTimeNode.value = 0;
  return {
    activePetalCount,
  };
}
