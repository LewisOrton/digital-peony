import * as THREE from 'three/webgpu';
import { PETAL_DEFAULTS, sampleUniformBSpline } from './petal';

export type FlowerModeSettings = {
  curviness: number;
  bloomOpenness: number;
  creaseFrequency: number;
  creaseAmplitude: number;
  wrinkleFrequency: number;
  wrinkleAmplitude: number;
  sizeFalloff: Array<[outness: number, scale: number]>;
  widthFalloff: Array<[outness: number, scale: number]>;
};

export const FLOWER_MODE_DEFAULTS = Object.freeze({
  curviness: 1,
  bloomOpenness: 0.6108652381980153,
  creaseFrequency: 22,
  creaseAmplitude: 0.25,
  wrinkleFrequency: 8,
  wrinkleAmplitude: 0.1,
  sizeFalloff: Object.freeze([
    Object.freeze([0, 0.36668750000000006] as const),
    Object.freeze([0.25, 0.3089375] as const),
    Object.freeze([0.5, 0.8240000000000001] as const),
    Object.freeze([0.75, 1.3203293457031249] as const),
    Object.freeze([1, 1.196] as const),
  ] as const),
  widthFalloff: Object.freeze([
    Object.freeze([0, 0.40812499999999996] as const),
    Object.freeze([0.25, 0.4225] as const),
    Object.freeze([0.5, 0.6638053385416671] as const),
    Object.freeze([0.75, 1.3346386718749998] as const),
    Object.freeze([1, 1.4] as const),
  ] as const),
});

export const FLOWER_PETAL_BASE_SCALE = 0.46;

export const BLOOM_OPENNESS = {
  minimumRadians: THREE.MathUtils.degToRad(-35),
  maximumRadians: THREE.MathUtils.degToRad(35),
  stepRadians: THREE.MathUtils.degToRad(1),
  innerOutness: 0.2,
} as const;

export const CREASE_NOISE_CELL_SCALE = 127.1;
export const WRINKLE_NOISE_CELL_V_SCALE = 311.7;
export const CREASE_NOISE_HASH_SCALE = 43758.5453123;
export const CREASE_PHASE_INDEX_SCALE = 12.9898;
export const CREASE_PHASE_HASH_SCALE = 43758.5453;
export const CREASE_PHASE_RANGE = 31;
export const WRINKLE_PHASE_V_SCALE = 0.754877666;
export const WRINKLE_V_FREQUENCY_DIVISOR = 5;

export function sampleBloomOpennessWeight(outness: number) {
  return THREE.MathUtils.smoothstep(
    outness,
    BLOOM_OPENNESS.innerOutness,
    1,
  );
}

export function sampleBloomOpennessAngle(
  outness: number,
  opennessRadians: number = FLOWER_MODE_DEFAULTS.bloomOpenness,
) {
  return opennessRadians * sampleBloomOpennessWeight(outness);
}

export function createFlowerPetalOrientation(
  anchorOrientation: THREE.Quaternion,
  outness: number,
  opennessRadians: number = FLOWER_MODE_DEFAULTS.bloomOpenness,
) {
  const orientation = anchorOrientation.clone().multiply(
    new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI * 0.5,
    ),
  );
  const opennessAngle = sampleBloomOpennessAngle(
    outness,
    opennessRadians,
  );
  if (opennessAngle !== 0) {
    orientation.multiply(
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        opennessAngle,
      ),
    );
  }
  return orientation;
}

function fract(value: number) {
  return value - Math.floor(value);
}

function gradientHash(cell: number) {
  return (
    fract(Math.sin(cell * CREASE_NOISE_CELL_SCALE) * CREASE_NOISE_HASH_SCALE) *
      2 -
    1
  );
}

function gradientHash2D(cellU: number, cellV: number) {
  const angle =
    fract(
      Math.sin(
        cellU * CREASE_NOISE_CELL_SCALE +
          cellV * WRINKLE_NOISE_CELL_V_SCALE,
      ) * CREASE_NOISE_HASH_SCALE,
    ) *
    Math.PI *
    2;
  return { u: Math.cos(angle), v: Math.sin(angle) };
}

export function sampleSignedNoise2D(coordinateU: number, coordinateV: number) {
  const cellU = Math.floor(coordinateU);
  const cellV = Math.floor(coordinateV);
  const tU = coordinateU - cellU;
  const tV = coordinateV - cellV;
  const smoothU = tU * tU * (3 - 2 * tU);
  const smoothV = tV * tV * (3 - 2 * tV);
  const smoothUDerivative = 6 * tU * (1 - tU);
  const smoothVDerivative = 6 * tV * (1 - tV);
  const gradient00 = gradientHash2D(cellU, cellV);
  const gradient10 = gradientHash2D(cellU + 1, cellV);
  const gradient01 = gradientHash2D(cellU, cellV + 1);
  const gradient11 = gradientHash2D(cellU + 1, cellV + 1);
  const value00 = gradient00.u * tU + gradient00.v * tV;
  const value10 = gradient10.u * (tU - 1) + gradient10.v * tV;
  const value01 = gradient01.u * tU + gradient01.v * (tV - 1);
  const value11 =
    gradient11.u * (tU - 1) + gradient11.v * (tV - 1);
  const lower = THREE.MathUtils.lerp(value00, value10, smoothU);
  const upper = THREE.MathUtils.lerp(value01, value11, smoothU);
  const lowerDerivativeU =
    THREE.MathUtils.lerp(gradient00.u, gradient10.u, smoothU) +
    (value10 - value00) * smoothUDerivative;
  const upperDerivativeU =
    THREE.MathUtils.lerp(gradient01.u, gradient11.u, smoothU) +
    (value11 - value01) * smoothUDerivative;
  const lowerDerivativeV = THREE.MathUtils.lerp(
    gradient00.v,
    gradient10.v,
    smoothU,
  );
  const upperDerivativeV = THREE.MathUtils.lerp(
    gradient01.v,
    gradient11.v,
    smoothU,
  );
  return {
    signedNoise: THREE.MathUtils.lerp(lower, upper, smoothV),
    derivativeU: THREE.MathUtils.lerp(
      lowerDerivativeU,
      upperDerivativeU,
      smoothV,
    ),
    derivativeV:
      THREE.MathUtils.lerp(
        lowerDerivativeV,
        upperDerivativeV,
        smoothV,
      ) +
      (upper - lower) * smoothVDerivative,
  };
}

export function wrinkleNoiseCoordinates(
  uvX: number,
  rootToTip: number,
  phase: number,
  frequency: number,
) {
  return {
    u: uvX * frequency + phase,
    v:
      rootToTip * (frequency / WRINKLE_V_FREQUENCY_DIVISOR) +
      phase * WRINKLE_PHASE_V_SCALE,
  };
}

export function sampleSignedCreaseNoise(coordinate: number) {
  const cell = Math.floor(coordinate);
  const t = coordinate - cell;
  const smoothT = t * t * (3 - 2 * t);
  const left = gradientHash(cell) * t;
  const right = gradientHash(cell + 1) * (t - 1);
  return THREE.MathUtils.lerp(left, right, smoothT);
}

export function sampleCreaseSignal(coordinate: number) {
  return THREE.MathUtils.clamp(
    Math.abs(sampleSignedCreaseNoise(coordinate)) / 0.7,
    0,
    1,
  );
}

export function stableCreasePhase(index: number) {
  return (
    fract(
      Math.sin((index + 1) * CREASE_PHASE_INDEX_SCALE) *
        CREASE_PHASE_HASH_SCALE,
    ) * CREASE_PHASE_RANGE
  );
}

export function sampleCreaseAmount(
  uvX: number,
  rootToTip: number,
  phase = 0,
  frequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  amplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
) {
  const signal = sampleCreaseSignal(
    uvX * frequency + phase,
  );
  return signal * rootToTip * amplitude * PETAL_DEFAULTS.height;
}

export function creaseFlatPetalPoint(
  position: THREE.Vector3,
  uvX: number,
  rootToTip: number,
  phase: number,
  frequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  amplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
) {
  return new THREE.Vector3(
    position.x,
    position.y -
      sampleCreaseAmount(
        uvX,
        rootToTip,
        phase,
        frequency,
        amplitude,
      ),
    position.z,
  );
}

function deformFlowerPetalPointWithStrength(
  position: THREE.Vector3,
  uvX: number,
  shapeU: number,
  rootToTip: number,
  phase: number,
  strength: number,
  frequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  amplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
) {
  const creasedPosition = creaseFlatPetalPoint(
    position,
    uvX,
    rootToTip,
    phase,
    frequency,
    amplitude,
  );
  const bendT = rootToTip * (1 - Math.exp(-rootToTip / 0.025));
  const bendAngle = -strength * 0.95 * bendT;
  const arcScale =
    Math.abs(bendAngle) > 1e-6
      ? Math.sin(bendAngle) / bendAngle
      : 1;
  const arcDepth =
    Math.abs(bendAngle) > 1e-6
      ? (creasedPosition.y * (1 - Math.cos(bendAngle))) / bendAngle
      : 0;
  const lateralCoordinate = shapeU * 2 - 1;
  const lateralScoop =
    PETAL_DEFAULTS.height *
    strength *
    0.12 *
    bendT *
    lateralCoordinate *
    lateralCoordinate;

  return new THREE.Vector3(
    creasedPosition.x,
    creasedPosition.y * arcScale + lateralScoop * Math.sin(bendAngle),
    arcDepth - lateralScoop * Math.cos(bendAngle),
  );
}

export function deformFlowerPetalPoint(
  position: THREE.Vector3,
  uvX: number,
  shapeU: number,
  rootToTip: number,
  phase: number,
  curviness: number = FLOWER_MODE_DEFAULTS.curviness,
  frequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  amplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
) {
  return deformFlowerPetalPointWithStrength(
    position,
    uvX,
    shapeU,
    rootToTip,
    phase,
    THREE.MathUtils.clamp(curviness, 0, 1),
    frequency,
    amplitude,
  );
}

export function sampleWrinkleAmount(
  uvX: number,
  rootToTip: number,
  phase = 0,
  frequency: number = FLOWER_MODE_DEFAULTS.wrinkleFrequency,
  amplitude: number = FLOWER_MODE_DEFAULTS.wrinkleAmplitude,
) {
  if (rootToTip === 0) {
    return 0;
  }
  const coordinate = wrinkleNoiseCoordinates(
    uvX,
    rootToTip,
    phase,
    frequency,
  );
  const signedSignal = THREE.MathUtils.clamp(
    sampleSignedNoise2D(coordinate.u, coordinate.v).signedNoise / 0.7,
    -1,
    1,
  );
  return (
    signedSignal *
    Math.pow(rootToTip, 3) *
    amplitude *
    PETAL_DEFAULTS.height
  );
}

function postCurvinessAverageNormalWithStrength(
  shapeU: number,
  rootToTip: number,
  strength: number,
) {
  const bendT = rootToTip * (1 - Math.exp(-rootToTip / 0.025));
  const bendAngle = -strength * 0.95 * bendT;
  const lateralCoordinate = shapeU * 2 - 1;
  const lateralSlope =
    PETAL_DEFAULTS.height *
    strength *
    0.12 *
    bendT *
    4 *
    lateralCoordinate;
  const tangentAcross = new THREE.Vector3(
    1,
    lateralSlope * Math.sin(bendAngle),
    -lateralSlope * Math.cos(bendAngle),
  ).normalize();
  const tangentAlong = new THREE.Vector3(
    0,
    Math.cos(bendAngle),
    Math.sin(bendAngle),
  );
  tangentAlong
    .addScaledVector(tangentAcross, -tangentAlong.dot(tangentAcross))
    .normalize();
  return tangentAcross.cross(tangentAlong).normalize();
}

export function postCurvinessAverageNormal(
  shapeU: number,
  rootToTip: number,
  curviness: number = FLOWER_MODE_DEFAULTS.curviness,
) {
  return postCurvinessAverageNormalWithStrength(
    shapeU,
    rootToTip,
    THREE.MathUtils.clamp(curviness, 0, 1),
  );
}

export function deformFlowerPetalPointWithWrinkle(
  position: THREE.Vector3,
  uvX: number,
  shapeU: number,
  rootToTip: number,
  phase: number,
  curviness: number = FLOWER_MODE_DEFAULTS.curviness,
  creaseFrequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  creaseAmplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
  wrinkleFrequency: number = FLOWER_MODE_DEFAULTS.wrinkleFrequency,
  wrinkleAmplitude: number = FLOWER_MODE_DEFAULTS.wrinkleAmplitude,
) {
  const curvedPosition = deformFlowerPetalPoint(
    position,
    uvX,
    shapeU,
    rootToTip,
    phase,
    curviness,
    creaseFrequency,
    creaseAmplitude,
  );
  return curvedPosition.addScaledVector(
    postCurvinessAverageNormal(shapeU, rootToTip, curviness),
    sampleWrinkleAmount(
      uvX,
      rootToTip,
      phase,
      wrinkleFrequency,
      wrinkleAmplitude,
    ),
  );
}

export function deformFlowerPetalPointWithSignedCurvinessAndWrinkle(
  position: THREE.Vector3,
  uvX: number,
  shapeU: number,
  rootToTip: number,
  phase: number,
  curviness: number,
  creaseFrequency: number = FLOWER_MODE_DEFAULTS.creaseFrequency,
  creaseAmplitude: number = FLOWER_MODE_DEFAULTS.creaseAmplitude,
  wrinkleFrequency: number = FLOWER_MODE_DEFAULTS.wrinkleFrequency,
  wrinkleAmplitude: number = FLOWER_MODE_DEFAULTS.wrinkleAmplitude,
) {
  return deformFlowerPetalPointWithStrength(
    position,
    uvX,
    shapeU,
    rootToTip,
    phase,
    curviness,
    creaseFrequency,
    creaseAmplitude,
  ).addScaledVector(
    postCurvinessAverageNormalWithStrength(
      shapeU,
      rootToTip,
      curviness,
    ),
    sampleWrinkleAmount(
      uvX,
      rootToTip,
      phase,
      wrinkleFrequency,
      wrinkleAmplitude,
    ),
  );
}

export function sampleSizeFalloff(
  outness: number,
  profile: ReadonlyArray<readonly [number, number]> =
    FLOWER_MODE_DEFAULTS.sizeFalloff,
) {
  return sampleUniformBSpline(profile, outness);
}

export function sampleWidthFalloff(
  outness: number,
  profile: ReadonlyArray<readonly [number, number]> =
    FLOWER_MODE_DEFAULTS.widthFalloff,
) {
  return sampleUniformBSpline(profile, outness);
}
