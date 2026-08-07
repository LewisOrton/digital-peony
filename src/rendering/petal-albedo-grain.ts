import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  float,
  instanceIndex,
  mix,
  texture,
  textureStore,
  uint,
  uvec2,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { GpuPetalTextureRecipe } from './petal-texture-batch';

export const PETAL_ALBEDO_GRAIN = Object.freeze({
  id: 'petalAlbedoGrain',
  textureWidth: 2048,
  textureHeight: 2048,
  anisotropy: 1,
  seed: 0x50454f4e,
  seedOffsetU: 0.754877666,
  seedOffsetV: 0.569840296,
  samplingScale: 2 / 3,
  contributionMultiplier: 1.2,
  saturationStrength: 0.9,
  luminanceStrength: 0.15,
  colorShiftStrength: 0.16,
  baseTextureBytes: 2048 * 2048 * 4,
  mipmappedTextureBytes: 22369620,
} as const);

type ScalarNode = any;

function hashUint(x: ScalarNode, y: ScalarNode, salt: number) {
  let word = (uint as any)(x)
    .mul((uint as any)(1597334677))
    .bitXor(
      (uint as any)(y).mul((uint as any)(3812015801)),
    )
    .bitXor((uint as any)(salt >>> 0));
  word = word
    .bitXor(word.shiftRight((uint as any)(16)))
    .mul((uint as any)(2246822519));
  word = word
    .bitXor(word.shiftRight((uint as any)(13)))
    .mul((uint as any)(3266489917));
  return word.bitXor(word.shiftRight((uint as any)(16)));
}

function hash01(x: ScalarNode, y: ScalarNode, salt: number) {
  return (float as any)(hashUint(x, y, salt)).div(4294967295);
}

function spotField(
  pixelX: ScalarNode,
  pixelY: ScalarNode,
  cellSize: number,
  salt: number,
) {
  const periodX = PETAL_ALBEDO_GRAIN.textureWidth / cellSize;
  const periodY = PETAL_ALBEDO_GRAIN.textureHeight / cellSize;
  const cellX = pixelX.div((uint as any)(cellSize));
  const cellY = pixelY.div((uint as any)(cellSize));
  let field: ScalarNode = (float as any)(0);
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const neighborX = cellX
        .add((uint as any)(periodX + offsetX))
        .mod((uint as any)(periodX));
      const neighborY = cellY
        .add((uint as any)(periodY + offsetY))
        .mod((uint as any)(periodY));
      const featureX = (float as any)(
        neighborX.mul((uint as any)(cellSize)),
      ).add(
        hash01(neighborX, neighborY, salt)
          .mul(cellSize - 1)
          .add(0.5),
      );
      const featureY = (float as any)(
        neighborY.mul((uint as any)(cellSize)),
      ).add(
        hash01(neighborX, neighborY, salt + 1)
          .mul(cellSize - 1)
          .add(0.5),
      );
      const directX = featureX
        .sub((float as any)(pixelX).add(0.5))
        .abs();
      const directY = featureY
        .sub((float as any)(pixelY).add(0.5))
        .abs();
      const deltaX = directX.min(
        (float as any)(PETAL_ALBEDO_GRAIN.textureWidth).sub(
          directX,
        ),
      );
      const deltaY = directY.min(
        (float as any)(PETAL_ALBEDO_GRAIN.textureHeight).sub(
          directY,
        ),
      );
      const radius = hash01(
        neighborX,
        neighborY,
        salt + 2,
      )
        .mul(cellSize * 0.24)
        .add(cellSize * 0.12);
      const distance = deltaX
        .mul(deltaX)
        .add(deltaY.mul(deltaY))
        .sqrt()
        .div(radius);
      const spot = distance
        .oneMinus()
        .max(0)
        .pow(2)
        .mul(
          hash01(neighborX, neighborY, salt + 3)
            .mul(0.55)
            .add(0.45),
        );
      field = field.add(spot);
    }
  }
  return field.clamp(0, 1);
}

export function createPetalAlbedoGrainRecipe():
  GpuPetalTextureRecipe {
  const { textureWidth: width, textureHeight: height } =
    PETAL_ALBEDO_GRAIN;
  return {
    id: PETAL_ALBEDO_GRAIN.id,
    name: 'GpuBakedPetalAlbedoGrain',
    seed: PETAL_ALBEDO_GRAIN.seed,
    width,
    height,
    anisotropy: PETAL_ALBEDO_GRAIN.anisotropy,
    packedSignals: ['staticPetalAlbedoGrain'],
    createComputeNode(output: THREE.StorageTexture) {
      return (Fn as any)(() => {
        (If as any)(
          instanceIndex.lessThan((uint as any)(width * height)),
          () => {
            const pixelX = instanceIndex.mod((uint as any)(width));
            const pixelY = instanceIndex.div((uint as any)(width));
            const baseNoise = hash01(
              pixelX,
              pixelY,
              PETAL_ALBEDO_GRAIN.seed,
            )
              .sub(0.5)
              .mul(0.1);
            const microSpots = spotField(
              pixelX,
              pixelY,
              16,
              PETAL_ALBEDO_GRAIN.seed + 101,
            );
            const shadowSpots = spotField(
              pixelX,
              pixelY,
              32,
              PETAL_ALBEDO_GRAIN.seed + 503,
            );
            const bloomSpots = spotField(
              pixelX,
              pixelY,
              64,
              PETAL_ALBEDO_GRAIN.seed + 907,
            );
            const signal = microSpots
              .mul(0.55)
              .add(shadowSpots.mul(0.9))
              .add(bloomSpots.mul(0.52))
              .add(baseNoise.mul(0.2))
              .clamp(0, 1);
            const encoded = signal.mul(0.5).add(0.5);
            (textureStore as any)(
              output,
              (uvec2 as any)(pixelX, pixelY),
              (vec4 as any)(encoded, encoded, encoded, 1),
            );
          },
        );
      })().compute(width * height);
    },
  };
}

export function applyPetalAlbedoGrain({
  colorNode,
  uvNode,
  seedNode,
  grainTexture,
}: {
  colorNode: ScalarNode;
  uvNode: ScalarNode;
  seedNode: ScalarNode;
  grainTexture: THREE.Texture;
}) {
  const sampleUv = (vec2 as any)(
    uvNode.x
      .mul(PETAL_ALBEDO_GRAIN.samplingScale)
      .add(seedNode.mul(PETAL_ALBEDO_GRAIN.seedOffsetU)),
    uvNode.y
      .mul(PETAL_ALBEDO_GRAIN.samplingScale)
      .add(seedNode.mul(PETAL_ALBEDO_GRAIN.seedOffsetV)),
  );
  const grainSignal = (texture as any)(grainTexture, sampleUv)
    .r.mul(2)
    .sub(1)
    .toVar('staticPetalAlbedoGrain');
  const luminance = colorNode
    .dot((vec3 as any)(0.2126, 0.7152, 0.0722))
    .toVar('petalAlbedoLuminance');
  const spotStrength = grainSignal
    .abs()
    .mul(PETAL_ALBEDO_GRAIN.contributionMultiplier)
    .clamp(0, 1)
    .toVar('staticPetalAlbedoSpotStrength');
  const saturation = spotStrength
    .mul(PETAL_ALBEDO_GRAIN.saturationStrength)
    .add(1);
  const saturatedColor = (mix as any)(
    (vec3 as any)(luminance),
    colorNode,
    saturation,
  );
  return saturatedColor
    .mul(
      spotStrength
        .mul(PETAL_ALBEDO_GRAIN.luminanceStrength)
        .oneMinus(),
    )
    .add(
      (vec3 as any)(1, -0.35, 0.6).mul(
        spotStrength.mul(PETAL_ALBEDO_GRAIN.colorShiftStrength),
      ),
    )
    .clamp(0, 1)
    .toVar('petalAlbedoWithStaticGrain');
}
