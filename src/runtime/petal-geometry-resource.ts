import * as THREE from 'three/webgpu';
import {
  PETAL_GEOMETRY,
  type ActivePetalTopology,
} from '../geometry/geometry-contract';
import {
  writePetalGeometryArrays,
  type PetalGeometryArrays,
  type ReadonlyPetalGeometrySettings,
} from '../geometry/petal';

export type CanonicalPetalGeometryResource = {
  readonly geometry: THREE.BufferGeometry;
  readonly topology: ActivePetalTopology;
  setFlowerInstance(
    index: number,
    matrix: THREE.Matrix4,
    outness: number,
  ): void;
  commitFlowerInstances(count: number): void;
  dispose(): void;
};

function markActivePrefix(
  attribute: THREE.BufferAttribute,
  componentCount: number,
) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, componentCount);
  attribute.needsUpdate = true;
}

export function createCanonicalPetalGeometryResource(
  initialSettings: ReadonlyPetalGeometrySettings,
):
  CanonicalPetalGeometryResource {
  const arrays: PetalGeometryArrays = {
    positions: new Float32Array(
      PETAL_GEOMETRY.topology.maximumVertices * 3,
    ),
    normals: new Float32Array(
      PETAL_GEOMETRY.topology.maximumVertices * 3,
    ),
    uvs: new Float32Array(
      PETAL_GEOMETRY.topology.maximumVertices * 2,
    ),
    shapeCoordinates: new Float32Array(
      PETAL_GEOMETRY.topology.maximumVertices * 3,
    ),
    indices: new Uint32Array(
      PETAL_GEOMETRY.topology.maximumTriangleIndices,
    ),
  };
  const position = new THREE.BufferAttribute(arrays.positions, 3);
  const normal = new THREE.BufferAttribute(arrays.normals, 3);
  const uv = new THREE.BufferAttribute(arrays.uvs, 2);
  const shapeCoordinate = new THREE.BufferAttribute(
    arrays.shapeCoordinates,
    3,
  );
  const index = new THREE.BufferAttribute(arrays.indices, 1);
  const basisX = new THREE.InstancedBufferAttribute(
    new Float32Array(
      PETAL_GEOMETRY.flowerCapacity.maximumPetals * 3,
    ),
    3,
  );
  const basisY = new THREE.InstancedBufferAttribute(
    new Float32Array(
      PETAL_GEOMETRY.flowerCapacity.maximumPetals * 3,
    ),
    3,
  );
  const basisZ = new THREE.InstancedBufferAttribute(
    new Float32Array(
      PETAL_GEOMETRY.flowerCapacity.maximumPetals * 3,
    ),
    3,
  );
  const outness = new THREE.InstancedBufferAttribute(
    new Float32Array(PETAL_GEOMETRY.flowerCapacity.maximumPetals),
    1,
  );
  const petalIndex = new THREE.InstancedBufferAttribute(
    new Float32Array(PETAL_GEOMETRY.flowerCapacity.maximumPetals),
    1,
  );
  for (
    let index = 0;
    index < PETAL_GEOMETRY.flowerCapacity.maximumPetals;
    index += 1
  ) {
    petalIndex.setX(index, index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', uv);
  geometry.setAttribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
    shapeCoordinate,
  );
  geometry.setAttribute(
    PETAL_GEOMETRY.instanceAttributes.basisX,
    basisX,
  );
  geometry.setAttribute(
    PETAL_GEOMETRY.instanceAttributes.basisY,
    basisY,
  );
  geometry.setAttribute(
    PETAL_GEOMETRY.instanceAttributes.basisZ,
    basisZ,
  );
  geometry.setAttribute(
    PETAL_GEOMETRY.instanceAttributes.outness,
    outness,
  );
  geometry.setAttribute(
    PETAL_GEOMETRY.instanceAttributes.petalIndex,
    petalIndex,
  );
  geometry.setIndex(index);

  const topology: ActivePetalTopology = {
    renderColumns: 0,
    renderRows: 0,
    vertexCount: 0,
  };
  const matrixBasis = new THREE.Vector3();
  let disposed = false;

  function buildGeometry() {
    const active = writePetalGeometryArrays(arrays, initialSettings);
    topology.renderColumns = active.renderColumns;
    topology.renderRows = active.renderRows;
    topology.vertexCount = active.vertexCount;
    geometry.setDrawRange(0, active.triangleIndexCount);
    markActivePrefix(position, active.vertexCount * 3);
    markActivePrefix(normal, active.vertexCount * 3);
    markActivePrefix(uv, active.vertexCount * 2);
    markActivePrefix(shapeCoordinate, active.vertexCount * 3);
    markActivePrefix(index, active.triangleIndexCount);

    const bounds = new THREE.Box3().makeEmpty();
    const point = new THREE.Vector3();
    for (let vertex = 0; vertex < active.vertexCount; vertex += 1) {
      point.fromBufferAttribute(position, vertex);
      bounds.expandByPoint(point);
    }
    geometry.boundingBox = bounds;
    geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  }

  function setFlowerInstance(
    instance: number,
    matrix: THREE.Matrix4,
    instanceOutness: number,
  ) {
    matrixBasis.setFromMatrixColumn(matrix, 0);
    basisX.setXYZ(instance, matrixBasis.x, matrixBasis.y, matrixBasis.z);
    matrixBasis.setFromMatrixColumn(matrix, 1);
    basisY.setXYZ(instance, matrixBasis.x, matrixBasis.y, matrixBasis.z);
    matrixBasis.setFromMatrixColumn(matrix, 2);
    basisZ.setXYZ(instance, matrixBasis.x, matrixBasis.y, matrixBasis.z);
    outness.setX(instance, instanceOutness);
  }

  function commitFlowerInstances(count: number) {
    markActivePrefix(basisX, count * 3);
    markActivePrefix(basisY, count * 3);
    markActivePrefix(basisZ, count * 3);
    markActivePrefix(outness, count);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
  }

  buildGeometry();
  return {
    geometry,
    topology,
    setFlowerInstance,
    commitFlowerInstances,
    dispose,
  };
}
