import { mix } from 'three/tsl';
import {
  CREASE_NOISE_CELL_SCALE,
  CREASE_NOISE_HASH_SCALE,
  WRINKLE_NOISE_CELL_V_SCALE,
} from '../geometry/flower-mode';

export function signedNoiseNodes(coordinate: any) {
  const cell = coordinate.floor();
  const t = coordinate.fract();
  const smoothT = t.mul(t).mul(t.mul(-2).add(3));
  const leftGradient = cell
    .mul(CREASE_NOISE_CELL_SCALE)
    .sin()
    .mul(CREASE_NOISE_HASH_SCALE)
    .fract()
    .mul(2)
    .sub(1);
  const rightGradient = cell
    .add(1)
    .mul(CREASE_NOISE_CELL_SCALE)
    .sin()
    .mul(CREASE_NOISE_HASH_SCALE)
    .fract()
    .mul(2)
    .sub(1);
  const leftValue = leftGradient.mul(t);
  const rightValue = rightGradient.mul(t.sub(1));
  const signedNoise = (mix as any)(leftValue, rightValue, smoothT);
  const smoothDerivative = t.mul(t.oneMinus()).mul(6);
  const derivative = (mix as any)(
    leftGradient,
    rightGradient,
    smoothT,
  ).add(rightValue.sub(leftValue).mul(smoothDerivative));
  return { signedNoise, derivative };
}

export function signedNoise2DNodes(
  coordinateU: any,
  coordinateV: any,
) {
  const cellU = coordinateU.floor();
  const cellV = coordinateV.floor();
  const tU = coordinateU.fract();
  const tV = coordinateV.fract();
  const smoothU = tU.mul(tU).mul(tU.mul(-2).add(3));
  const smoothV = tV.mul(tV).mul(tV.mul(-2).add(3));
  const smoothUDerivative = tU.mul(tU.oneMinus()).mul(6);
  const smoothVDerivative = tV.mul(tV.oneMinus()).mul(6);

  function gradient(
    offsetU: number,
    offsetV: number,
  ) {
    const angle = cellU
      .add(offsetU)
      .mul(CREASE_NOISE_CELL_SCALE)
      .add(
        cellV
          .add(offsetV)
          .mul(WRINKLE_NOISE_CELL_V_SCALE),
      )
      .sin()
      .mul(CREASE_NOISE_HASH_SCALE)
      .fract()
      .mul(Math.PI * 2);
    return {
      u: angle.cos(),
      v: angle.sin(),
    };
  }

  const gradient00 = gradient(0, 0);
  const gradient10 = gradient(1, 0);
  const gradient01 = gradient(0, 1);
  const gradient11 = gradient(1, 1);
  const value00 = gradient00.u.mul(tU).add(gradient00.v.mul(tV));
  const value10 = gradient10.u
    .mul(tU.sub(1))
    .add(gradient10.v.mul(tV));
  const value01 = gradient01.u
    .mul(tU)
    .add(gradient01.v.mul(tV.sub(1)));
  const value11 = gradient11.u
    .mul(tU.sub(1))
    .add(gradient11.v.mul(tV.sub(1)));
  const lower = (mix as any)(value00, value10, smoothU);
  const upper = (mix as any)(value01, value11, smoothU);
  const lowerDerivativeU = (mix as any)(
    gradient00.u,
    gradient10.u,
    smoothU,
  ).add(value10.sub(value00).mul(smoothUDerivative));
  const upperDerivativeU = (mix as any)(
    gradient01.u,
    gradient11.u,
    smoothU,
  ).add(value11.sub(value01).mul(smoothUDerivative));
  const lowerDerivativeV = (mix as any)(
    gradient00.v,
    gradient10.v,
    smoothU,
  );
  const upperDerivativeV = (mix as any)(
    gradient01.v,
    gradient11.v,
    smoothU,
  );
  return {
    signedNoise: (mix as any)(lower, upper, smoothV),
    derivativeU: (mix as any)(
      lowerDerivativeU,
      upperDerivativeU,
      smoothV,
    ),
    derivativeV: (mix as any)(
      lowerDerivativeV,
      upperDerivativeV,
      smoothV,
    ).add(upper.sub(lower).mul(smoothVDerivative)),
  };
}
