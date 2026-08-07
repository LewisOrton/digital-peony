import * as THREE from 'three/webgpu';
import { PETAL_GEOMETRY } from './geometry-contract';

export type ReadonlyPetalGeometrySettings = {
  readonly subdivisionsX: number;
  readonly subdivisionsY: number;
  readonly height: number;
  readonly sideProfile: ReadonlyArray<readonly [number, number]>;
  readonly topProfile: ReadonlyArray<readonly [number, number]>;
};

export const PETAL_DEFAULTS: ReadonlyPetalGeometrySettings = Object.freeze({
  subdivisionsX: 20,
  subdivisionsY: 12,
  height: 2.2,
  sideProfile: Object.freeze([
    Object.freeze([0, 0.15539772727272724] as const),
    Object.freeze([0.18, 0.44715909090909095] as const),
    Object.freeze([0.55, 0.85] as const),
    Object.freeze([0.82, 0.85] as const),
    Object.freeze([1, 0.4803977272727273] as const),
  ] as const),
  topProfile: Object.freeze([
    Object.freeze([-1, 0.7682148096755703] as const),
    Object.freeze([-0.995, 0.16875] as const),
    Object.freeze([0, 0] as const),
    Object.freeze([0.995, 0.16875] as const),
    Object.freeze([1, 0.7682148096755703] as const),
  ] as const),
});

export const TOP_EDGE_HORIZONTAL_DENSITY_EXPONENT = 1.3;

function evaluateUniformBSplinePoint(
  profile: ReadonlyArray<readonly [number, number]>,
  segment: number,
  amount: number,
) {
  const first = profile[segment];
  const second = profile[segment + 1];
  const third = profile[segment + 2];
  const fourth = profile[segment + 3];
  const amountSquared = amount * amount;
  const amountCubed = amountSquared * amount;
  const weights = [
    (1 - 3 * amount + 3 * amountSquared - amountCubed) / 6,
    (4 - 6 * amountSquared + 3 * amountCubed) / 6,
    (1 + 3 * amount + 3 * amountSquared - 3 * amountCubed) / 6,
    amountCubed / 6,
  ];

  return {
    position:
      first[0] * weights[0] +
      second[0] * weights[1] +
      third[0] * weights[2] +
      fourth[0] * weights[3],
    value:
      first[1] * weights[0] +
      second[1] * weights[1] +
      third[1] * weights[2] +
      fourth[1] * weights[3],
  };
}

export function sampleUniformBSpline(
  profile: ReadonlyArray<readonly [number, number]>,
  position: number,
) {
  const first = profile[0];
  const second = profile[1];
  const last = profile[profile.length - 1];
  const beforeLast = profile[profile.length - 2];

  const extendedProfile: Array<[number, number]> = [
    [first[0] * 2 - second[0], first[1]],
    ...profile.map((point): [number, number] => [point[0], point[1]]),
    [last[0] * 2 - beforeLast[0], last[1]],
  ];
  let previous = evaluateUniformBSplinePoint(extendedProfile, 0, 0);
  if (position <= previous.position) {
    return previous.value;
  }

  for (let segment = 0; segment < extendedProfile.length - 3; segment += 1) {
    for (let step = 1; step <= 24; step += 1) {
      const current = evaluateUniformBSplinePoint(
        extendedProfile,
        segment,
        step / 24,
      );

      if (position <= current.position) {
        const amount =
          (position - previous.position) /
          (current.position - previous.position);
        return THREE.MathUtils.lerp(previous.value, current.value, amount);
      }

      previous = current;
    }
  }

  return previous.value;
}

export function sampleSideBSpline(
  profile: ReadonlyArray<readonly [position: number, halfWidth: number]>,
  position: number,
) {
  return sampleUniformBSpline(profile, position);
}

export function sampleTopBSpline(
  profile: ReadonlyArray<readonly [position: number, drop: number]>,
  position: number,
) {
  return sampleUniformBSpline(profile, position);
}

export function samplePetalSurfacePoint(
  parameters: ReadonlyPetalGeometrySettings,
  shapeU: number,
  v: number,
) {
  const normalizedX = shapeU * 2 - 1;
  const rootAnchoredY = v * parameters.height;
  const topDrop = sampleTopBSpline(parameters.topProfile, normalizedX);
  const postTopY = rootAnchoredY - topDrop * v;
  const sidePosition = THREE.MathUtils.clamp(
    postTopY / parameters.height,
    0,
    1,
  );
  const widthScale = sampleSideBSpline(
    parameters.sideProfile,
    sidePosition,
  );
  return new THREE.Vector2(normalizedX * widthScale, postTopY);
}

function invertTopHalfArcLength(
  sampleCoordinates: Float64Array,
  cumulativeLengths: Float64Array,
  normalizedLength: number,
) {
  const targetLength =
    cumulativeLengths[cumulativeLengths.length - 1] * normalizedLength;
  let upper = 1;
  while (
    upper < cumulativeLengths.length - 1 &&
    cumulativeLengths[upper] < targetLength
  ) {
    upper += 1;
  }
  const lower = upper - 1;
  const intervalLength =
    cumulativeLengths[upper] - cumulativeLengths[lower];
  const amount =
    (targetLength - cumulativeLengths[lower]) / intervalLength;
  return THREE.MathUtils.lerp(
    sampleCoordinates[lower],
    sampleCoordinates[upper],
    amount,
  );
}

export function redistributeTopHalfArcLength(normalizedLength: number) {
  return Math.pow(normalizedLength, TOP_EDGE_HORIZONTAL_DENSITY_EXPONENT);
}

export function buildPetalTopArcLengthTargets(
  parameters = PETAL_DEFAULTS,
) {
  const halfSampleCount = 1024;
  const sampleCoordinates = new Float64Array(halfSampleCount + 1);
  const cumulativeLengths = new Float64Array(halfSampleCount + 1);
  let previous = samplePetalSurfacePoint(parameters, 0, 1);
  for (let sample = 0; sample <= halfSampleCount; sample += 1) {
    const shapeU = sample / halfSampleCount / 2;
    sampleCoordinates[sample] = shapeU;
    if (sample > 0) {
      const point = samplePetalSurfacePoint(parameters, shapeU, 1);
      cumulativeLengths[sample] =
        cumulativeLengths[sample - 1] + point.distanceTo(previous);
      previous = point;
    }
  }

  const targets = new Float64Array(parameters.subdivisionsX + 1);
  for (let column = 0; column <= parameters.subdivisionsX; column += 1) {
    const gridU = column / parameters.subdivisionsX;
    if (gridU === 0 || gridU === 0.5 || gridU === 1) {
      targets[column] = gridU;
    } else if (gridU < 0.5) {
      targets[column] = invertTopHalfArcLength(
        sampleCoordinates,
        cumulativeLengths,
        redistributeTopHalfArcLength(gridU * 2),
      );
    } else {
      targets[column] =
        1 -
        invertTopHalfArcLength(
          sampleCoordinates,
          cumulativeLengths,
          redistributeTopHalfArcLength((1 - gridU) * 2),
        );
    }
  }
  return targets;
}

export function blendPetalShapeU(
  gridU: number,
  tipShapeU: number,
  v: number,
) {
  return THREE.MathUtils.lerp(gridU, tipShapeU, v * v);
}

export type PetalGeometryArrays = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  shapeCoordinates: Float32Array;
  indices: Uint32Array;
};

export function writePetalGeometryArrays(
  arrays: PetalGeometryArrays,
  parameters = PETAL_DEFAULTS,
) {
  const topArcLengthTargets = buildPetalTopArcLengthTargets(parameters);
  let vertex = 0;

  for (let row = 0; row <= parameters.subdivisionsY; row += 1) {
    const v = row / parameters.subdivisionsY;

    for (let column = 0; column <= parameters.subdivisionsX; column += 1) {
      const u = column / parameters.subdivisionsX;
      const shapeU = blendPetalShapeU(
        u,
        topArcLengthTargets[column],
        v,
      );
      const point = samplePetalSurfacePoint(parameters, shapeU, v);

      const positionOffset = vertex * 3;
      const uvOffset = vertex * 2;
      arrays.positions.set([point.x, point.y, 0], positionOffset);
      arrays.normals.set([0, 0, 1], positionOffset);
      arrays.uvs.set([shapeU, v], uvOffset);
      arrays.shapeCoordinates.set(
        [shapeU, column, row],
        positionOffset,
      );
      vertex += 1;
    }
  }

  const rowWidth = parameters.subdivisionsX + 1;
  let indexOffset = 0;
  for (let row = 0; row < parameters.subdivisionsY; row += 1) {
    for (let column = 0; column < parameters.subdivisionsX; column += 1) {
      const lowerLeft = row * rowWidth + column;
      const lowerRight = lowerLeft + 1;
      const upperLeft = lowerLeft + rowWidth;
      const upperRight = upperLeft + 1;
      arrays.indices.set(
        [
          lowerLeft,
          lowerRight,
          upperRight,
          lowerLeft,
          upperRight,
          upperLeft,
        ],
        indexOffset,
      );
      indexOffset += 6;
    }
  }

  return {
    vertexCount: vertex,
    triangleIndexCount: indexOffset,
    renderColumns: parameters.subdivisionsX + 1,
    renderRows: parameters.subdivisionsY + 1,
  };
}

export function buildPetalGeometry(parameters = PETAL_DEFAULTS) {
  const vertexCount =
    (parameters.subdivisionsX + 1) * (parameters.subdivisionsY + 1);
  const triangleIndexCount =
    parameters.subdivisionsX * parameters.subdivisionsY * 6;
  const arrays: PetalGeometryArrays = {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    uvs: new Float32Array(vertexCount * 2),
    shapeCoordinates: new Float32Array(vertexCount * 3),
    indices: new Uint32Array(triangleIndexCount),
  };
  writePetalGeometryArrays(arrays, parameters);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(arrays.positions, 3),
  );
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(arrays.normals, 3),
  );
  geometry.setAttribute('uv', new THREE.BufferAttribute(arrays.uvs, 2));
  geometry.setAttribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
    new THREE.BufferAttribute(arrays.shapeCoordinates, 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}
