import * as THREE from 'three/webgpu';
import {
  mix,
  texture,
  vec2,
} from 'three/tsl';
import { FINE_VEIN_DETAIL } from './fine-vein-detail';

export const BAKED_PETAL_BUMP = Object.freeze({
  defaultStrength: 0.25,
  minimumStrength: 0,
  maximumStrength: 1,
  strengthStep: 0.05,
  textureWidth: 2048,
  textureHeight: 256,
  octaveCount: 3,
  frequencyU: 1280 / 9,
  frequencyV: (1280 / 9) / 4,
  verticalStretch: 4,
  lacunarity: 2,
  persistence: 0.5,
  normalSlopeScale: 0.0018,
  overdrive: 1,
  fineSlopeStrength: 1,
  macroSlopeStrength: 1,
  fineSlopeContribution: 0.3,
  macroSlopeContribution: 0.7,
  fineFeatureScale: 2,
  fineSamplingFrequencyScale: 1 / 2,
  macroFeatureScale: 15,
  macroSamplingFrequencyScale: 1 / 15,
  seedOffsetU: 5.37,
  seedOffsetV: 3.91,
} as const);

type ScalarNode = any;

export function createBakedPetalBumpNormalNode({
  uvNode,
  seedNode,
  strengthNode,
  baseViewNormalNode,
  tangentAcrossNode,
  tangentAlongNode,
  faceDirectionNode,
  bumpTexture,
}: {
  uvNode: ScalarNode;
  seedNode: ScalarNode;
  strengthNode: ScalarNode;
  baseViewNormalNode: ScalarNode;
  tangentAcrossNode: ScalarNode;
  tangentAlongNode: ScalarNode;
  faceDirectionNode: ScalarNode;
  bumpTexture: THREE.Texture;
}) {
  const baseSampleUv = (vec2 as any)(
    uvNode.x.add(
      seedNode.mul(BAKED_PETAL_BUMP.seedOffsetU),
    ),
    uvNode.y.add(
      seedNode.mul(BAKED_PETAL_BUMP.seedOffsetV),
    ),
  );
  const fineSampleUv = baseSampleUv.mul(
    BAKED_PETAL_BUMP.fineSamplingFrequencyScale,
  );
  const macroSampleUv = baseSampleUv.mul(
    BAKED_PETAL_BUMP.macroSamplingFrequencyScale,
  );
  const fineSampledSlope = (texture as any)(
    bumpTexture,
    fineSampleUv,
  )
    .gb.mul(2)
    .sub(1);
  const macroSampledSlope = (texture as any)(
    bumpTexture,
    macroSampleUv,
  )
    .gb.mul(2)
    .sub(1);
  const fineSampledZ = fineSampledSlope
    .dot(fineSampledSlope)
    .oneMinus()
    .max(0.0025)
    .sqrt();
  const macroSampledZ = macroSampledSlope
    .dot(macroSampledSlope)
    .oneMinus()
    .max(0.0025)
    .sqrt();
  const fineSlope = fineSampledSlope
    .div(fineSampledZ)
    .mul(BAKED_PETAL_BUMP.fineSlopeStrength)
    .mul(BAKED_PETAL_BUMP.fineSlopeContribution);
  const macroSlope = macroSampledSlope
    .div(macroSampledZ)
    .mul(BAKED_PETAL_BUMP.macroSlopeStrength)
    .mul(BAKED_PETAL_BUMP.macroSlopeContribution);
  const compositeSlope = fineSlope
    .add(macroSlope)
    .toVar('compositePetalBumpSlope');
  const envelopeBase = uvNode.y
    .mul(uvNode.y)
    .mul(uvNode.y.mul(-2).add(3));
  const envelope = envelopeBase
    .clamp(0, 1)
    .pow(FINE_VEIN_DETAIL.envelopePower);
  const scale = strengthNode
    .mul(BAKED_PETAL_BUMP.overdrive)
    .mul(envelope)
    .mul(faceDirectionNode);
  const perturbedNormal = baseViewNormalNode
    .add(tangentAcrossNode.mul(compositeSlope.x).mul(scale))
    .add(tangentAlongNode.mul(compositeSlope.y).mul(scale))
    .normalize();
  return (mix as any)(
    baseViewNormalNode,
    perturbedNormal,
    strengthNode.greaterThan(0).toFloat(),
  );
}
