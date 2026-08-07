import {
  LIVING_FLOWER,
  LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT,
} from './living-flower-contract';
import type { LivingFlowerCompute } from './living-flower-compute';

type CollisionCandidateBuild = {
  restPositions: Float32Array;
  activePetalCount: number;
  gridColumns: number;
  gridRows: number;
  renderColumns: number;
  renderRows: number;
  candidateData: Float32Array;
};

type TriangleReference = {
  petal: number;
  localTriangle: number;
  a: number;
  b: number;
  c: number;
};

const cellKey = (x: number, y: number, z: number) =>
  `${x},${y},${z}`;

export function buildLivingFlowerCollisionCandidates({
  restPositions,
  activePetalCount,
  gridColumns,
  gridRows,
  renderColumns,
  renderRows,
  candidateData,
}: CollisionCandidateBuild) {
  const gridVertexCount = gridColumns * gridRows;
  const renderVertexCount = renderColumns * renderRows;
  const triangleCount =
    (gridColumns - 1) * (gridRows - 1) * 2;
  const activeGridParticleCount =
    activePetalCount * gridVertexCount;
  const gridCandidateData = new Float32Array(
    activeGridParticleCount *
      LIVING_FLOWER.maximumCollisionCandidates *
      4,
  );

  const searchRadius = LIVING_FLOWER.collisionSearchRadius;
  const inverseCellSize = 1 / searchRadius;
  const triangles: TriangleReference[] = [];
  const buckets = new Map<string, number[]>();
  const addToBucket = (
    x: number,
    y: number,
    z: number,
    triangle: number,
  ) => {
    const key = cellKey(x, y, z);
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [triangle]);
    else bucket.push(triangle);
  };

  for (let petal = 0; petal < activePetalCount; petal += 1) {
    const petalOffset = petal * gridVertexCount;
    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += 1
    ) {
      const cell = Math.floor(triangleIndex / 2);
      const cellColumn = cell % (gridColumns - 1);
      const cellRow = Math.floor(cell / (gridColumns - 1));
      const lowerLeft =
        cellRow * gridColumns + cellColumn;
      const secondTriangle = triangleIndex % 2 === 1;
      const a = petalOffset + lowerLeft;
      const b =
        petalOffset +
        (secondTriangle
          ? lowerLeft + gridColumns + 1
          : lowerLeft + 1);
      const c =
        petalOffset +
        (secondTriangle
          ? lowerLeft + gridColumns
          : lowerLeft + gridColumns + 1);
      const reference = {
        petal,
        localTriangle: triangleIndex,
        a,
        b,
        c,
      };
      const triangle = triangles.push(reference) - 1;
      const aOffset = a * 4;
      const bOffset = b * 4;
      const cOffset = c * 4;
      const minimumX = Math.floor(
        Math.min(
          restPositions[aOffset],
          restPositions[bOffset],
          restPositions[cOffset],
        ) * inverseCellSize,
      );
      const minimumY = Math.floor(
        Math.min(
          restPositions[aOffset + 1],
          restPositions[bOffset + 1],
          restPositions[cOffset + 1],
        ) * inverseCellSize,
      );
      const minimumZ = Math.floor(
        Math.min(
          restPositions[aOffset + 2],
          restPositions[bOffset + 2],
          restPositions[cOffset + 2],
        ) * inverseCellSize,
      );
      const maximumX = Math.floor(
        Math.max(
          restPositions[aOffset],
          restPositions[bOffset],
          restPositions[cOffset],
        ) * inverseCellSize,
      );
      const maximumY = Math.floor(
        Math.max(
          restPositions[aOffset + 1],
          restPositions[bOffset + 1],
          restPositions[cOffset + 1],
        ) * inverseCellSize,
      );
      const maximumZ = Math.floor(
        Math.max(
          restPositions[aOffset + 2],
          restPositions[bOffset + 2],
          restPositions[cOffset + 2],
        ) * inverseCellSize,
      );
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        for (let y = minimumY; y <= maximumY; y += 1) {
          for (let x = minimumX; x <= maximumX; x += 1) {
            addToBucket(x, y, z, triangle);
          }
        }
      }
    }
  }

  const seenTriangles = new Set<number>();
  const bestTriangle = new Int32Array(activePetalCount);
  const bestDistance = new Float64Array(activePetalCount);
  const bestBarycentricV = new Float64Array(activePetalCount);
  const bestBarycentricW = new Float64Array(activePetalCount);
  const bestSide = new Int8Array(activePetalCount);
  const selectedPetals = new Int32Array(
    LIVING_FLOWER.maximumCollisionCandidates,
  );
  for (
    let particle = 0;
    particle < activeGridParticleCount;
    particle += 1
  ) {
    const sourceOffset = particle * 4;
    if (restPositions[sourceOffset + 3] <= 0) continue;
    const sourcePetal = Math.floor(particle / gridVertexCount);
    const px = restPositions[sourceOffset];
    const py = restPositions[sourceOffset + 1];
    const pz = restPositions[sourceOffset + 2];
    const cellX = Math.floor(px * inverseCellSize);
    const cellY = Math.floor(py * inverseCellSize);
    const cellZ = Math.floor(pz * inverseCellSize);
    seenTriangles.clear();
    bestTriangle.fill(-1);
    bestDistance.fill(Number.POSITIVE_INFINITY);

    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = buckets.get(
            cellKey(cellX + dx, cellY + dy, cellZ + dz),
          );
          if (bucket === undefined) continue;
          for (const triangleIndex of bucket) {
            if (seenTriangles.has(triangleIndex)) continue;
            seenTriangles.add(triangleIndex);
            const triangle = triangles[triangleIndex];
            if (triangle.petal === sourcePetal) continue;
            const aOffset = triangle.a * 4;
            const bOffset = triangle.b * 4;
            const cOffset = triangle.c * 4;
            const ax = restPositions[aOffset];
            const ay = restPositions[aOffset + 1];
            const az = restPositions[aOffset + 2];
            const edge0X = restPositions[bOffset] - ax;
            const edge0Y = restPositions[bOffset + 1] - ay;
            const edge0Z = restPositions[bOffset + 2] - az;
            const edge1X = restPositions[cOffset] - ax;
            const edge1Y = restPositions[cOffset + 1] - ay;
            const edge1Z = restPositions[cOffset + 2] - az;
            const normalX = edge0Y * edge1Z - edge0Z * edge1Y;
            const normalY = edge0Z * edge1X - edge0X * edge1Z;
            const normalZ = edge0X * edge1Y - edge0Y * edge1X;
            const normalLength = Math.hypot(
              normalX,
              normalY,
              normalZ,
            );
            if (normalLength <= 0.000001) continue;
            const pointX = px - ax;
            const pointY = py - ay;
            const pointZ = pz - az;
            const signedDistance =
              (pointX * normalX +
                pointY * normalY +
                pointZ * normalZ) /
              normalLength;
            const distance = Math.abs(signedDistance);
            if (
              distance <= 0.00001 ||
              distance > searchRadius ||
              distance >= bestDistance[triangle.petal]
            ) {
              continue;
            }
            const d00 =
              edge0X * edge0X +
              edge0Y * edge0Y +
              edge0Z * edge0Z;
            const d01 =
              edge0X * edge1X +
              edge0Y * edge1Y +
              edge0Z * edge1Z;
            const d11 =
              edge1X * edge1X +
              edge1Y * edge1Y +
              edge1Z * edge1Z;
            const d20 =
              pointX * edge0X +
              pointY * edge0Y +
              pointZ * edge0Z;
            const d21 =
              pointX * edge1X +
              pointY * edge1Y +
              pointZ * edge1Z;
            const denominator = d00 * d11 - d01 * d01;
            if (Math.abs(denominator) <= 0.0000001) continue;
            const barycentricV =
              (d11 * d20 - d01 * d21) / denominator;
            const barycentricW =
              (d00 * d21 - d01 * d20) / denominator;
            const barycentricU =
              1 - barycentricV - barycentricW;
            if (
              barycentricU < -0.035 ||
              barycentricV < -0.035 ||
              barycentricW < -0.035
            ) {
              continue;
            }
            bestTriangle[triangle.petal] = triangle.localTriangle;
            bestDistance[triangle.petal] = distance;
            bestBarycentricV[triangle.petal] = barycentricV;
            bestBarycentricW[triangle.petal] = barycentricW;
            bestSide[triangle.petal] = signedDistance >= 0 ? 1 : -1;
          }
        }
      }
    }

    selectedPetals.fill(-1);
    for (
      let targetPetal = 0;
      targetPetal < activePetalCount;
      targetPetal += 1
    ) {
      if (bestTriangle[targetPetal] < 0) continue;
      for (
        let slot = 0;
        slot < LIVING_FLOWER.maximumCollisionCandidates;
        slot += 1
      ) {
        const selected = selectedPetals[slot];
        if (
          selected < 0 ||
          bestDistance[targetPetal] < bestDistance[selected]
        ) {
          for (
            let shift =
              LIVING_FLOWER.maximumCollisionCandidates - 1;
            shift > slot;
            shift -= 1
          ) {
            selectedPetals[shift] = selectedPetals[shift - 1];
          }
          selectedPetals[slot] = targetPetal;
          break;
        }
      }
    }
    for (
      let slot = 0;
      slot < LIVING_FLOWER.maximumCollisionCandidates;
      slot += 1
    ) {
      const targetPetal = selectedPetals[slot];
      if (targetPetal < 0) break;
      const component =
        particle * LIVING_FLOWER.maximumCollisionCandidates + slot;
      const gridCell = Math.floor(
        bestTriangle[targetPetal] / 2,
      );
      const gridCellColumn = gridCell % (gridColumns - 1);
      const gridCellRow = Math.floor(
        gridCell / (gridColumns - 1),
      );
      const renderCellRow = Math.min(
        renderRows - 2,
        gridCellRow * 2,
      );
      const renderTriangle =
        (renderCellRow * (renderColumns - 1) +
          gridCellColumn) *
          2 +
        (bestTriangle[targetPetal] % 2);
      const encoded =
        targetPetal *
          LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT +
        renderTriangle +
        1;
      const candidateOffset = component * 4;
      gridCandidateData[candidateOffset] =
        encoded * bestSide[targetPetal];
      gridCandidateData[candidateOffset + 1] =
        bestBarycentricV[targetPetal];
      gridCandidateData[candidateOffset + 2] =
        bestBarycentricW[targetPetal];
      gridCandidateData[candidateOffset + 3] =
        LIVING_FLOWER.collisionThickness;
    }
  }

  const activeRenderParticleCount =
    activePetalCount * renderVertexCount;
  candidateData.fill(
    0,
    0,
    activeRenderParticleCount *
      LIVING_FLOWER.maximumCollisionCandidates *
      4,
  );
  for (let petal = 0; petal < activePetalCount; petal += 1) {
    for (let renderRow = 0; renderRow < renderRows; renderRow += 1) {
      const gridRow = Math.min(
        gridRows - 1,
        Math.floor(renderRow / 2),
      );
      for (
        let column = 0;
        column < renderColumns;
        column += 1
      ) {
        const gridParticle =
          petal * gridVertexCount + gridRow * gridColumns + column;
        const renderParticle =
          petal * renderVertexCount +
          renderRow * renderColumns +
          column;
        const gridOffset =
          gridParticle *
          LIVING_FLOWER.maximumCollisionCandidates *
          4;
        const renderOffset =
          renderParticle *
          LIVING_FLOWER.maximumCollisionCandidates *
          4;
        for (
          let component = 0;
          component <
          LIVING_FLOWER.maximumCollisionCandidates * 4;
          component += 1
        ) {
          candidateData[renderOffset + component] =
            gridCandidateData[gridOffset + component];
        }
      }
    }
  }
}

export function rebuildLivingFlowerCollisionState({
  compute,
  activePetalCount,
  gridColumns,
  gridRows,
  renderColumns,
  renderRows,
}: {
  compute: LivingFlowerCompute;
  activePetalCount: number;
  gridColumns: number;
  gridRows: number;
  renderColumns: number;
  renderRows: number;
}) {
  const candidateData =
    compute.collisionCandidateStorage.value
      .array as Float32Array;
  buildLivingFlowerCollisionCandidates({
    restPositions:
      compute.restPositionStorage.value.array as Float32Array,
    activePetalCount,
    gridColumns,
    gridRows,
    renderColumns,
    renderRows,
    candidateData,
  });
  const activeRenderParticleCount =
    activePetalCount * renderColumns * renderRows;
  const storage = compute.collisionCandidateStorage.value;
  storage.clearUpdateRanges();
  storage.addUpdateRange(
    0,
    activeRenderParticleCount *
      LIVING_FLOWER.maximumCollisionCandidates *
      4,
  );
  storage.needsUpdate = true;
}
