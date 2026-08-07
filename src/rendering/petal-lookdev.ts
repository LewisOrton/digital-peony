import * as THREE from 'three/webgpu';
import {
  int,
  texture,
  vec3,
} from 'three/tsl';
import {
  createFineVeinDetailNodes,
  FINE_VEIN_DETAIL,
} from './fine-vein-detail';
import { signedNoise2DNodes } from './noise-nodes';
import { PETAL_LOOKDEV } from './petal-lookdev-contract';
import { applyPetalAlbedoGrain } from './petal-albedo-grain';
import { petalBroadTextureUvNode } from './petal-broad-texture-bake';

type ScalarNode = any;

export type PetalLookNodes = {
  color: ScalarNode;
  roughness: ScalarNode;
  transmission: ScalarNode;
  canopyRootMask: ScalarNode;
};

export function createPetalLookNodes({
  uvNode,
  broadLayerNode,
  seedNode,
  elapsedSecondsNode,
  fineVeinStrengthNode,
  fineVeinTexture,
  albedoGrainTexture,
  broadTexture,
}: {
  uvNode: ScalarNode;
  broadLayerNode: ScalarNode;
  seedNode: ScalarNode;
  elapsedSecondsNode: ScalarNode;
  fineVeinStrengthNode: ScalarNode;
  fineVeinTexture: THREE.Texture;
  albedoGrainTexture: THREE.Texture;
  broadTexture: THREE.StorageArrayTexture;
}): PetalLookNodes {
  const broadSample = (texture as any)(
    broadTexture,
    petalBroadTextureUvNode(uvNode),
  )
    .depth((int as any)(broadLayerNode))
    .toVar('petalBroadColorCanopySample');
  const materialNoiseNodes = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.surfaceVariation.frequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.surfaceVariation.seedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.surfaceVariation.frequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.surfaceVariation.seedV)),
  );
  const materialNoise = materialNoiseNodes.signedNoise
    .div(0.7)
    .clamp(-1, 1)
    .toVar('petalSurfaceVariation');
  const overlayPrimaryNodes = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.overlay.primaryFrequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.primarySeedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.overlay.primaryFrequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.primarySeedV)),
  );
  const overlayPrimary = overlayPrimaryNodes.signedNoise
    .div(0.7)
    .clamp(-1, 1);
  const overlaySecondaryNodes = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.overlay.secondaryFrequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.secondarySeedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.overlay.secondaryFrequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.secondarySeedV)),
  );
  const overlayTertiaryNodes = signedNoise2DNodes(
    uvNode.x
      .mul(PETAL_LOOKDEV.overlay.tertiaryFrequencyU)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.tertiarySeedU)),
    uvNode.y
      .mul(PETAL_LOOKDEV.overlay.tertiaryFrequencyV)
      .add(seedNode.mul(PETAL_LOOKDEV.overlay.tertiarySeedV)),
  );
  const overlaySignal = overlayPrimary
    .mul(PETAL_LOOKDEV.overlay.primaryWeight)
    .add(
      overlaySecondaryNodes.signedNoise
        .div(0.7)
        .clamp(-1, 1)
        .mul(PETAL_LOOKDEV.overlay.secondaryWeight),
    )
    .add(
      overlayTertiaryNodes.signedNoise
        .div(0.7)
        .clamp(-1, 1)
        .mul(PETAL_LOOKDEV.overlay.tertiaryWeight),
    )
    .toVar('petalAlbedoOverlay');
  const makeVec3 = vec3 as (...values: any[]) => any;
  const overlayColor = broadSample.rgb
    .mul(
      overlaySignal
        .mul(PETAL_LOOKDEV.overlay.brightness)
        .add(1),
    )
    .add(
      makeVec3(
        overlaySignal
          .mul(PETAL_LOOKDEV.overlay.chroma)
          .mul(0.65),
        overlaySignal
          .mul(PETAL_LOOKDEV.overlay.chroma)
          .mul(-0.28),
        overlaySignal
          .mul(PETAL_LOOKDEV.overlay.chroma)
          .mul(0.48),
      ),
    )
    .clamp(0, 1);
  const fineVeinField = createFineVeinDetailNodes({
    uvNode,
    elapsedSecondsNode,
    seedNode,
    detailTexture: fineVeinTexture,
  });
  const fineVeinSignal = fineVeinField.signal
    .mul(FINE_VEIN_DETAIL.visibleContributionScale)
    .toVar('fineVeinVisibleContribution');
  const fineVeinColor = overlayColor
    .mul(
      fineVeinSignal
        .mul(FINE_VEIN_DETAIL.albedoAmplitude)
        .mul(fineVeinStrengthNode)
        .add(1),
    )
    .clamp(0, 1);
  const albedoColor = applyPetalAlbedoGrain({
    colorNode: fineVeinColor,
    uvNode,
    seedNode,
    grainTexture: albedoGrainTexture,
  });
  const transmission = materialNoise
    .mul(PETAL_LOOKDEV.transmission.openAreaGain)
    .add(1)
    .clamp(
      PETAL_LOOKDEV.transmission.minimum,
      PETAL_LOOKDEV.transmission.maximum,
    );
  const roughness = materialNoise
    .mul(PETAL_LOOKDEV.roughness.variation)
    .add(PETAL_LOOKDEV.roughness.base)
    .add(
      fineVeinSignal
        .mul(FINE_VEIN_DETAIL.roughnessAmplitude)
        .mul(fineVeinStrengthNode),
    )
    .clamp(
      FINE_VEIN_DETAIL.roughnessMinimum,
      FINE_VEIN_DETAIL.roughnessMaximum,
    );

  return {
    color: albedoColor,
    roughness,
    transmission,
    canopyRootMask: broadSample.a,
  };
}
