import * as THREE from 'three/webgpu';
import {
  fwidth,
  mix,
  smoothstep,
  texture,
  vec2,
} from 'three/tsl';

export const FINE_VEIN_DETAIL = Object.freeze({
  defaultStrength: 0.68,
  minimumStrength: 0,
  maximumStrength: 1,
  strengthStep: 0.02,
  octaveCount: 3,
  featureScale: 1.5,
  samplingFrequencyScale: 1 / 1.5,
  visibleContributionScale: 1.3,
  frequencyU: (1280 / 9) / 1.5,
  frequencyV: 20 / 1.5,
  verticalStretch: ((1280 / 9) / 1.5) / (20 / 1.5),
  lacunarity: 2,
  persistence: 0.5,
  speed: 0.018,
  envelopePower: 1.65,
  edgeInner: 0.035,
  edgeOuter: 0.19,
  ridgeCenter: 0.34,
  ridgeGain: 1.35,
  albedoAmplitude: 0.22,
  roughnessAmplitude: 0.02,
  roughnessMinimum: 0.07,
  roughnessMaximum: 0.36,
  filterStart: 0.32,
  filterEnd: 0.72,
  seedU: 17.13,
  seedV: 11.71,
  seedTime: 7.93,
  phaseOffsetU: 0.754877666,
  phaseOffsetV: 0.569840296,
  textureWidth: 2048,
  textureHeight: 256,
  tilePeriodU: 142,
  tilePeriodV: 20,
  tileShearU: 3 / 20,
  tileShearV: 0,
  octaveOffsetU: 13.37,
  octaveOffsetV: 7.19,
  hashX: 1597334677,
  hashY: 3812015801,
} as const);

type ScalarNode = any;

function quinticNode(value: ScalarNode) {
  return value
    .mul(value)
    .mul(value)
    .mul(value.mul(value.mul(6).sub(15)).add(10));
}

function phaseOffsetNodes(
  timeSlice: ScalarNode,
  seedNode: ScalarNode,
) {
  return {
    u: timeSlice
      .mul(FINE_VEIN_DETAIL.phaseOffsetU)
      .add(seedNode.mul(FINE_VEIN_DETAIL.seedU))
      .fract(),
    v: timeSlice
      .mul(FINE_VEIN_DETAIL.phaseOffsetV)
      .add(seedNode.mul(FINE_VEIN_DETAIL.seedV))
      .fract(),
  };
}

export function createFineVeinDetailNodes({
  uvNode,
  elapsedSecondsNode,
  seedNode,
  detailTexture,
}: {
  uvNode: ScalarNode;
  elapsedSecondsNode: ScalarNode;
  seedNode: ScalarNode;
  detailTexture: THREE.Texture;
}) {
  const phase = elapsedSecondsNode
    .mul(FINE_VEIN_DETAIL.speed)
    .add(seedNode.mul(FINE_VEIN_DETAIL.seedTime));
  const timeSlice = phase.floor();
  const blend = quinticNode(phase.fract());
  const current = phaseOffsetNodes(timeSlice, seedNode);
  const next = phaseOffsetNodes(timeSlice.add(1), seedNode);
  const currentUv = (vec2 as any)(
    uvNode.x
      .mul(FINE_VEIN_DETAIL.samplingFrequencyScale)
      .add(current.u),
    uvNode.y
      .mul(FINE_VEIN_DETAIL.samplingFrequencyScale)
      .add(current.v),
  );
  const nextUv = (vec2 as any)(
    uvNode.x
      .mul(FINE_VEIN_DETAIL.samplingFrequencyScale)
      .add(next.u),
    uvNode.y
      .mul(FINE_VEIN_DETAIL.samplingFrequencyScale)
      .add(next.v),
  );
  const currentSignal = (texture as any)(detailTexture, currentUv)
    .r.mul(2)
    .sub(1);
  const nextSignal = (texture as any)(detailTexture, nextUv)
    .r.mul(2)
    .sub(1);
  const envelopeBase = uvNode.y
    .mul(uvNode.y)
    .mul(uvNode.y.mul(-2).add(3));
  const envelope = envelopeBase
    .clamp(0, 1)
    .pow(FINE_VEIN_DETAIL.envelopePower)
    .toVar('fineVeinDetailEnvelope');
  const footprint = (fwidth as any)(uvNode.x)
    .mul(FINE_VEIN_DETAIL.frequencyU)
    .max(
      (fwidth as any)(uvNode.y).mul(
        FINE_VEIN_DETAIL.frequencyV,
      ),
    );
  const filterVisibility = (smoothstep as any)(
    FINE_VEIN_DETAIL.filterStart,
    FINE_VEIN_DETAIL.filterEnd,
    footprint,
  )
    .oneMinus()
    .toVar('fineVeinDetailFilterVisibility');
  return {
    signal: (mix as any)(currentSignal, nextSignal, blend)
      .mul(envelope)
      .mul(filterVisibility)
      .toVar('fineVeinDetailSignal'),
    envelope,
    filterVisibility,
  };
}
