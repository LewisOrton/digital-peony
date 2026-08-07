const maximumSegmentsX = 20;
const maximumSegmentsY = 20;

export const PETAL_GEOMETRY = {
  uv: {
    u: 'petal-shape-coordinate',
    v: 'root-to-tip-row',
    minimum: 0,
    maximum: 1,
  },
  shapeCoordinate: {
    attribute: 'petalShapeU',
    components: {
      shapeU: 'x',
      gridColumn: 'y',
      gridRow: 'z',
    },
    root: 'original-grid-column',
    tip: 'boundary-dense-arc-length-top-boundary',
    blend: 'v-squared',
  },
  gridCoordinate: {
    attribute: 'petalShapeU',
    column: 'integer-grid-column',
    row: 'integer-grid-row',
  },
  localAxes: {
    width: 'x',
    growth: 'y',
    surfaceNormal: 'z',
  },
  instanceAttributes: {
    basisX: 'instanceBasisX',
    basisY: 'instanceBasisY',
    basisZ: 'instanceBasisZ',
    outness: 'instanceOutness',
    petalIndex: 'instancePetalIndex',
  },
  topology: {
    maximumSegmentsX,
    maximumSegmentsY,
    maximumVertices: (maximumSegmentsX + 1) * (maximumSegmentsY + 1),
    maximumTriangleIndices:
      maximumSegmentsX * maximumSegmentsY * 6,
  },
  flowerCapacity: {
    maximumPetals: 64,
  },
} as const;

export type ActivePetalTopology = {
  renderColumns: number;
  renderRows: number;
  vertexCount: number;
};

export type PetalDeformationInputs = {
  curviness: number;
  creaseFrequency: number;
  creaseAmplitude: number;
  wrinkleFrequency: number;
  wrinkleAmplitude: number;
};

export type ValueNode<T> = {
  value: T;
};

export type PetalDeformationUniforms = {
  curviness: ValueNode<number>;
  creaseFrequency: ValueNode<number>;
  creaseAmplitude: ValueNode<number>;
  wrinkleFrequency: ValueNode<number>;
  wrinkleAmplitude: ValueNode<number>;
};
