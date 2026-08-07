import * as THREE from 'three/webgpu';
import {
  Fn as typedFn,
  If as typedIf,
  float as typedFloat,
  int as typedInt,
  instanceIndex as typedInstanceIndex,
  textureStore as typedTextureStore,
  uint as typedUint,
  uvec2 as typedUvec2,
  vec2 as typedVec2,
  vec4 as typedVec4,
} from 'three/tsl';
import { BAKED_PETAL_BUMP } from './baked-petal-bump';
import { FINE_VEIN_DETAIL } from './fine-vein-detail';
import type { GpuPetalTextureRecipe } from './petal-texture-batch';

export const PETAL_DETAIL_TEXTURE_ID = 'petalMaterialDetail';
export const PETAL_DETAIL_TEXTURE_SEED = 0;
export const PETAL_DETAIL_TEXTURE_ANISOTROPY = 8;

// TSL's recursive node types grow prohibitively large for this bake graph.
// The public boundary remains typed; shader-node composition is intentionally
// erased here, matching the node types used by the rest of the renderer.
const Fn: any = typedFn;
const If: any = typedIf;
const float: any = typedFloat;
const int: any = typedInt;
const instanceIndex: any = typedInstanceIndex;
const textureStore: any = typedTextureStore;
const uint: any = typedUint;
const uvec2: any = typedUvec2;
const vec2: any = typedVec2;
const vec4: any = typedVec4;

function positiveModulo(value: any, modulus: number) {
  return value
    .mod(int(modulus))
    .add(int(modulus))
    .mod(int(modulus));
}

function pcgHashUint(seed: any) {
  const state = uint(seed)
    .mul(uint(747796405))
    .add(uint(2891336453));
  const word = state
    .shiftRight(state.shiftRight(uint(28)).add(uint(4)))
    .bitXor(state)
    .mul(uint(277803737));
  return word.shiftRight(uint(22)).bitXor(word);
}

function featureSeed(
  cellX: any,
  cellY: any,
  periodX: number,
  periodY: number,
) {
  const wrappedX = uint(positiveModulo(cellX, periodX));
  const wrappedY = uint(positiveModulo(cellY, periodY));
  return wrappedX
    .mul(uint(FINE_VEIN_DETAIL.hashX))
    .bitXor(wrappedY.mul(uint(FINE_VEIN_DETAIL.hashY)));
}

function worleyEdgeSignal(
  coordinateX: any,
  coordinateY: any,
  periodX: number,
  periodY: number,
) {
  const baseX = int(coordinateX.floor());
  const baseY = int(coordinateY.floor());
  const nearest = float(1e9).toVar();
  const secondNearest = float(1e9).toVar();
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = baseX.add(int(offsetX));
      const cellY = baseY.add(int(offsetY));
      const word = pcgHashUint(
        featureSeed(cellX, cellY, periodX, periodY),
      );
      const featureX = float(word.bitAnd(uint(0xffff))).div(65536);
      const featureY = float(word.shiftRight(uint(16))).div(65536);
      const deltaX = float(cellX).add(featureX).sub(coordinateX);
      const deltaY = float(cellY).add(featureY).sub(coordinateY);
      const distanceSquared = deltaX
        .mul(deltaX)
        .add(deltaY.mul(deltaY));
      If(distanceSquared.lessThan(nearest), () => {
        secondNearest.assign(nearest);
        nearest.assign(distanceSquared);
      }).ElseIf(distanceSquared.lessThan(secondNearest), () => {
        secondNearest.assign(distanceSquared);
      });
    }
  }
  const edgeDistance = secondNearest.sqrt().sub(nearest.sqrt());
  return edgeDistance
    .smoothstep(
      FINE_VEIN_DETAIL.edgeInner,
      FINE_VEIN_DETAIL.edgeOuter,
    )
    .oneMinus()
    .sub(FINE_VEIN_DETAIL.ridgeCenter)
    .mul(FINE_VEIN_DETAIL.ridgeGain)
    .clamp(-1, 1);
}

function fineVeinSignal(uvNode: any) {
  let scale = 1;
  let weight = 1;
  let totalWeight = 0;
  let signal: any = float(0);
  for (
    let octave = 0;
    octave < FINE_VEIN_DETAIL.octaveCount;
    octave += 1
  ) {
    const periodU = FINE_VEIN_DETAIL.tilePeriodU * scale;
    const periodV = FINE_VEIN_DETAIL.tilePeriodV * scale;
    const coordinateX = uvNode.x
      .mul(periodU)
      .add(
        uvNode.y
          .mul(periodV)
          .mul(FINE_VEIN_DETAIL.tileShearU),
      )
      .add(octave * FINE_VEIN_DETAIL.octaveOffsetU);
    const coordinateY = uvNode.y
      .mul(periodV)
      .add(
        uvNode.x
          .mul(periodU)
          .mul(FINE_VEIN_DETAIL.tileShearV),
      )
      .add(octave * FINE_VEIN_DETAIL.octaveOffsetV);
    signal = signal.add(
      worleyEdgeSignal(
        coordinateX,
        coordinateY,
        periodU,
        periodV,
      ).mul(weight),
    );
    totalWeight += weight;
    scale *= FINE_VEIN_DETAIL.lacunarity;
    weight *= FINE_VEIN_DETAIL.persistence;
  }
  return signal.div(totalWeight);
}

function smoothCurve(value: any) {
  return value.mul(value).mul(float(3).sub(value.mul(2)));
}

function gradientDot(
  cellX: any,
  cellY: any,
  deltaX: any,
  deltaY: any,
) {
  const seed = uint(cellX)
    .mul(uint(1597334677))
    .bitXor(uint(cellY).mul(uint(3812015801)));
  const angle = float(pcgHashUint(seed)).mul(
    Math.PI * 2 / 0x100000000,
  );
  return angle.cos().mul(deltaX).add(angle.sin().mul(deltaY));
}

function simplex(coordinateX: any, coordinateY: any) {
  const skew = coordinateX
    .add(coordinateY)
    .mul(0.3660254037844386);
  const cellX = int(coordinateX.add(skew).floor());
  const cellY = int(coordinateY.add(skew).floor());
  const unskew = float(cellX)
    .add(float(cellY))
    .mul(0.21132486540518713);
  const localX = coordinateX.sub(float(cellX).sub(unskew));
  const localY = coordinateY.sub(float(cellY).sub(unskew));
  const stepX = localX.greaterThan(localY).select(int(1), int(0));
  const stepY = localX.greaterThan(localY).select(int(0), int(1));
  const contribution = (
    offsetX: any,
    offsetY: any,
    deltaX: any,
    deltaY: any,
  ) => {
    const attenuation = float(0.5)
      .sub(deltaX.mul(deltaX))
      .sub(deltaY.mul(deltaY));
    const attenuationSquared = attenuation.mul(attenuation);
    return attenuation
      .greaterThan(0)
      .select(
        attenuationSquared
          .mul(attenuationSquared)
          .mul(
            gradientDot(
              cellX.add(offsetX),
              cellY.add(offsetY),
              deltaX,
              deltaY,
            ),
          ),
        0,
      );
  };
  const middleX = localX
    .sub(float(stepX))
    .add(0.21132486540518713);
  const middleY = localY
    .sub(float(stepY))
    .add(0.21132486540518713);
  const farX = localX.sub(1).add(0.42264973081037427);
  const farY = localY.sub(1).add(0.42264973081037427);
  return contribution(int(0), int(0), localX, localY)
    .add(
      contribution(stepX, stepY, middleX, middleY),
    )
    .add(contribution(int(1), int(1), farX, farY))
    .mul(70);
}

function tileableSimplex(
  coordinateX: any,
  coordinateY: any,
  periodX: number,
  periodY: number,
) {
  const amountX = smoothCurve(coordinateX.div(periodX));
  const amountY = smoothCurve(coordinateY.div(periodY));
  const lower = simplex(coordinateX, coordinateY)
    .mul(amountX.oneMinus())
    .add(
      simplex(coordinateX.sub(periodX), coordinateY).mul(amountX),
    );
  const upper = simplex(coordinateX, coordinateY.sub(periodY))
    .mul(amountX.oneMinus())
    .add(
      simplex(
        coordinateX.sub(periodX),
        coordinateY.sub(periodY),
      ).mul(amountX),
    );
  return lower
    .mul(amountY.oneMinus())
    .add(upper.mul(amountY));
}

function bumpHeight(uvNode: any) {
  let scale = 1;
  let weight = 1;
  let totalWeight = 0;
  let signal: any = float(0);
  for (
    let octave = 0;
    octave < BAKED_PETAL_BUMP.octaveCount;
    octave += 1
  ) {
    const periodU = Math.round(
      BAKED_PETAL_BUMP.frequencyU * scale,
    );
    const periodV = Math.round(
      BAKED_PETAL_BUMP.frequencyV * scale,
    );
    signal = signal.add(
      tileableSimplex(
        uvNode.x.mul(periodU),
        uvNode.y.mul(periodV),
        periodU,
        periodV,
      ).mul(weight),
    );
    totalWeight += weight;
    scale *= BAKED_PETAL_BUMP.lacunarity;
    weight *= BAKED_PETAL_BUMP.persistence;
  }
  return signal.div(totalWeight);
}

export function createPetalDetailTextureRecipe():
GpuPetalTextureRecipe {
  const width = FINE_VEIN_DETAIL.textureWidth;
  const height = FINE_VEIN_DETAIL.textureHeight;
  return {
    id: PETAL_DETAIL_TEXTURE_ID,
    name: 'GpuBakedPetalMaterialDetail',
    // Zero preserves the established baked vein/bump hash field exactly.
    seed: PETAL_DETAIL_TEXTURE_SEED,
    width,
    height,
    anisotropy: PETAL_DETAIL_TEXTURE_ANISOTROPY,
    packedSignals: [
      'r:fine-vein-worley',
      'g:bump-normal-x',
      'b:bump-normal-y',
    ],
    createComputeNode(texture: THREE.StorageTexture) {
      return Fn(() => {
        const texelX = instanceIndex.mod(uint(width));
        const texelY = instanceIndex.div(uint(width));
        const coordinate = uvec2(texelX, texelY);
        const uvNode = vec2(
          float(texelX).add(0.5).div(width),
          float(texelY).add(0.5).div(height),
        );
        const texel = vec2(1 / width, 1 / height);
        const slopeU = bumpHeight(
          uvNode.add(vec2(texel.x, 0)).fract(),
        )
          .sub(
            bumpHeight(
              uvNode.sub(vec2(texel.x, 0)).fract(),
            ),
          )
          .mul(width * 0.5 * BAKED_PETAL_BUMP.normalSlopeScale);
        const slopeV = bumpHeight(
          uvNode.add(vec2(0, texel.y)).fract(),
        )
          .sub(
            bumpHeight(
              uvNode.sub(vec2(0, texel.y)).fract(),
            ),
          )
          .mul(height * 0.5 * BAKED_PETAL_BUMP.normalSlopeScale);
        const inverseLength = slopeU
          .mul(slopeU)
          .add(slopeV.mul(slopeV))
          .add(1)
          .sqrt()
          .reciprocal();
        textureStore(
          texture,
          coordinate,
          vec4(
            fineVeinSignal(uvNode).mul(0.5).add(0.5),
            slopeU
              .negate()
              .mul(inverseLength)
              .mul(0.5)
              .add(0.5),
            slopeV
              .negate()
              .mul(inverseLength)
              .mul(0.5)
              .add(0.5),
            1,
          ),
        );
      })().compute(width * height);
    },
  };
}
