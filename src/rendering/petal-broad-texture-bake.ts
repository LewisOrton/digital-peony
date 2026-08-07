import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  int,
  instanceIndex,
  mix,
  smoothstep,
  storageTexture,
  textureStore,
  uint,
  uniform,
  uvec2,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { PETAL_GEOMETRY } from '../geometry/geometry-contract';
import { signedNoise2DNodes } from './noise-nodes';
import {
  PETAL_LOOKDEV,
  type PetalGradientStop,
} from './petal-lookdev-contract';
import type { GpuPetalTextureRecipe } from './petal-texture-batch';
import { CANOPY_OCCLUSION } from './canopy-occlusion';

export const PETAL_BROAD_TEXTURE = Object.freeze({
  id: 'petalBroadColorCanopy',
  width: 128,
  height: 128,
  layers: PETAL_GEOMETRY.flowerCapacity.maximumPetals,
  anisotropy: 1,
  packedSignals: [
    'rgb:static-broad-varied-color-linear',
    'a:canonical-canopy-root-mask',
  ] as const,
});

function clampAnchorCount(anchorCount: number) {
  return Math.min(
    PETAL_BROAD_TEXTURE.layers,
    Math.max(1, Math.round(anchorCount)),
  );
}

export function createStablePetalSeedNode(instanceNode: any) {
  return (float as any)(instanceNode)
    .add(1)
    .mul(PETAL_LOOKDEV.seed.indexScale)
    .sin()
    .mul(PETAL_LOOKDEV.seed.hashScale)
    .fract();
}

function broadVariedColorNode(
  uvNode: any,
  outnessNode: any,
  seedNode: any,
  gradientPositionNodes: any[],
  gradientColorNodes: any[],
) {
  const lowNoise = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.albedo.lowFrequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.albedo.lowSeedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.albedo.lowFrequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.albedo.lowSeedV)),
  ).signedNoise
    .div(0.7)
    .clamp(-1, 1)
    .toVar('petalBroadBakeLowNoise');
  const midNoise = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.albedo.midFrequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.albedo.midSeedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.albedo.midFrequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.albedo.midSeedV)),
  ).signedNoise
    .div(0.7)
    .clamp(-1, 1)
    .toVar('petalBroadBakeMidNoise');
  const outnessInfluence = outnessNode
    .clamp(0, 1)
    .mul((smoothstep as any)(0.12, 0.9, uvNode.y))
    .mul(PETAL_LOOKDEV.gradient.outnessShift);
  const gradientCoordinate = uvNode.y
    .add(outnessInfluence)
    .add(lowNoise.mul(PETAL_LOOKDEV.gradient.boundaryLowNoise))
    .add(midNoise.mul(PETAL_LOOKDEV.gradient.boundaryMidNoise))
    .clamp(0, 1);
  const [rootPosition, pinkStartPosition, pinkEndPosition, tipPosition] =
    gradientPositionNodes;
  const [rootColor, pinkStartColor, pinkEndColor, tipColor] =
    gradientColorNodes;
  const rootToPink = (smoothstep as any)(
    rootPosition,
    pinkStartPosition,
    gradientCoordinate,
  );
  const pinkBandAmount = (smoothstep as any)(
    pinkStartPosition,
    pinkEndPosition,
    gradientCoordinate,
  );
  const tipAmount = (smoothstep as any)(
    pinkEndPosition,
    tipPosition,
    gradientCoordinate,
  );
  const baseColor = (mix as any)(
    (mix as any)(
      (mix as any)(
        rootColor,
        pinkStartColor,
        rootToPink,
      ),
      pinkEndColor,
      pinkBandAmount,
    ),
    tipColor,
    tipAmount,
  );
  const brightness = lowNoise
    .mul(PETAL_LOOKDEV.albedo.brightnessLow)
    .add(midNoise.mul(PETAL_LOOKDEV.albedo.brightnessMid))
    .add(PETAL_LOOKDEV.albedo.brightnessBase);
  const chromaSignal = lowNoise.mul(0.58).add(midNoise.mul(0.42));
  const rootColorMask = rootToPink.oneMinus();
  const centerPinkMask = rootToPink.mul(tipAmount.oneMinus());
  const petalVariation = seedNode.sub(0.5).mul(0.035);
  return baseColor
    .mul(brightness)
    .add(
      (vec3 as any)(
        petalVariation.add(
          chromaSignal
            .mul(PETAL_LOOKDEV.albedo.chroma)
            .mul(centerPinkMask.mul(0.78).add(0.22)),
        ),
        petalVariation.mul(-0.28).add(
          chromaSignal
            .mul(PETAL_LOOKDEV.albedo.chroma)
            .mul(rootColorMask.mul(0.34).sub(centerPinkMask.mul(0.5))),
        ),
        petalVariation.mul(0.18).add(
          chromaSignal
            .mul(PETAL_LOOKDEV.albedo.chroma)
            .mul(centerPinkMask.mul(0.64).sub(rootColorMask.mul(0.22))),
        ),
      ),
    )
    .clamp(0, 1);
}

export function petalBroadTextureUvNode(uvNode: any) {
  return uvNode
    .mul(
      (vec2 as any)(
        (PETAL_BROAD_TEXTURE.width - 1) / PETAL_BROAD_TEXTURE.width,
        (PETAL_BROAD_TEXTURE.height - 1) / PETAL_BROAD_TEXTURE.height,
      ),
    )
    .add(
      (vec2 as any)(
        0.5 / PETAL_BROAD_TEXTURE.width,
        0.5 / PETAL_BROAD_TEXTURE.height,
      ),
    );
}

export function createPetalBroadTextureRecipe(initialAnchorCount: number): {
  recipe: GpuPetalTextureRecipe;
  setAnchorCount(anchorCount: number): boolean;
  setGradientStops(stops: ReadonlyArray<PetalGradientStop>): boolean;
} {
  let anchorCount = clampAnchorCount(initialAnchorCount);
  const anchorCountNode: any = (uniform as any)(anchorCount, 'uint');
  const gradientStops: PetalGradientStop[] =
    PETAL_LOOKDEV.colorStops.map((stop) => ({ ...stop }));
  const gradientPositionNodes = gradientStops.map(
    (stop) => (uniform as any)(stop.position),
  );
  const gradientColorNodes = gradientStops.map(
    (stop) => (uniform as any)(new THREE.Color(stop.color)),
  );
  const texelsPerLayer =
    PETAL_BROAD_TEXTURE.width * PETAL_BROAD_TEXTURE.height;
  const recipe: GpuPetalTextureRecipe = {
    id: PETAL_BROAD_TEXTURE.id,
    name: 'GpuBakedPetalBroadColorCanopyArray',
    seed: 0,
    width: PETAL_BROAD_TEXTURE.width,
    height: PETAL_BROAD_TEXTURE.height,
    depth: PETAL_BROAD_TEXTURE.layers,
    anisotropy: PETAL_BROAD_TEXTURE.anisotropy,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    packedSignals: PETAL_BROAD_TEXTURE.packedSignals,
    createComputeNode(output) {
      return (Fn as any)(() => {
        const layer: any = instanceIndex.div((uint as any)(texelsPerLayer));
        const texelIndex: any = instanceIndex.mod(
          (uint as any)(texelsPerLayer),
        );
        const texelX = texelIndex.mod((uint as any)(PETAL_BROAD_TEXTURE.width));
        const texelY = texelIndex.div((uint as any)(PETAL_BROAD_TEXTURE.width));
        const activeLastLayer: any = anchorCountNode.sub(1);
        const activeLayer = layer.min(activeLastLayer);
        const denominator = activeLastLayer.max(1);
        const outness = (float as any)(activeLayer)
          .div((float as any)(denominator))
          .sqrt();
        const uvNode = (vec2 as any)(
          (float as any)(texelX).div(PETAL_BROAD_TEXTURE.width - 1),
          (float as any)(texelY).div(PETAL_BROAD_TEXTURE.height - 1),
        );
        const seedNode = createStablePetalSeedNode(layer);
        const colorNode = broadVariedColorNode(
          uvNode,
          outness,
          seedNode,
          gradientPositionNodes,
          gradientColorNodes,
        );
        const canopyMaskNode = uvNode.y
          .oneMinus()
          .clamp(0, 1)
          .pow(CANOPY_OCCLUSION.rootExponent);
        const layeredOutput = (storageTexture as any)(output).depth(
          (int as any)(layer),
        );
        (textureStore as any)(
          layeredOutput,
          (uvec2 as any)(texelX, texelY),
          (vec4 as any)(colorNode, canopyMaskNode),
        );
      })().compute(texelsPerLayer * PETAL_BROAD_TEXTURE.layers);
    },
  };
  return {
    recipe,
    setAnchorCount(nextAnchorCount: number) {
      const next = clampAnchorCount(nextAnchorCount);
      if (next === anchorCount) return false;
      anchorCount = next;
      anchorCountNode.value = next;
      return true;
    },
    setGradientStops(nextStops: ReadonlyArray<PetalGradientStop>) {
      let changed = false;
      nextStops.forEach((stop, index) => {
        const current = gradientStops[index];
        if (
          current.position === stop.position &&
          current.color === stop.color
        ) {
          return;
        }
        current.position = stop.position;
        current.color = stop.color;
        gradientPositionNodes[index].value = stop.position;
        gradientColorNodes[index].value.setHex(stop.color);
        changed = true;
      });
      return changed;
    },
  };
}
