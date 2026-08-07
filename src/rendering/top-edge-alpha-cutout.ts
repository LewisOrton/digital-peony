import {
  float,
  fwidth,
  instanceIndex,
} from 'three/tsl';
import {
  CREASE_PHASE_HASH_SCALE,
  CREASE_PHASE_INDEX_SCALE,
  CREASE_PHASE_RANGE,
} from '../geometry/flower-mode';
import { signedNoiseNodes } from './noise-nodes';

export const TOP_EDGE_ALPHA_CUTOUT_V1 = {
  frequency: 28,
  maximumDepth: 0.018,
  narrownessPower: 6,
  sideTaperWidth: 0.06,
  fullDetailFootprint: 0.35,
  zeroDetailFootprint: 1,
} as const;

export type TopEdgeAlphaCutoutMasks = {
  petal: any;
  flower: any;
  petalCutDepth: any;
  flowerCutDepth: any;
  petalDetailSignal: any;
  flowerDetailSignal: any;
};

function stableInstancePhaseNode(instanceNode: any) {
  return (float as any)(instanceNode.add(1))
    .mul(CREASE_PHASE_INDEX_SCALE)
    .sin()
    .mul(CREASE_PHASE_HASH_SCALE)
    .fract()
    .mul(CREASE_PHASE_RANGE);
}

function createDetailNodes(uvNode: any, phaseNode: any) {
  const coordinate = uvNode.x
    .mul(TOP_EDGE_ALPHA_CUTOUT_V1.frequency)
    .add(phaseNode);
  const folded = signedNoiseNodes(coordinate).signedNoise
    .abs()
    .div(0.7)
    .clamp(0, 1);
  const ridge = folded
    .oneMinus()
    .pow(TOP_EDGE_ALPHA_CUTOUT_V1.narrownessPower);
  const sideDistance = uvNode.x.min(uvNode.x.oneMinus());
  const sideTaperT = sideDistance
    .div(TOP_EDGE_ALPHA_CUTOUT_V1.sideTaperWidth)
    .clamp(0, 1);
  const sideTaper = sideTaperT
    .mul(sideTaperT)
    .mul(sideTaperT.mul(-2).add(3));
  const footprint = (fwidth as any)(coordinate);
  const detailT = footprint
    .sub(TOP_EDGE_ALPHA_CUTOUT_V1.fullDetailFootprint)
    .div(
      TOP_EDGE_ALPHA_CUTOUT_V1.zeroDetailFootprint -
        TOP_EDGE_ALPHA_CUTOUT_V1.fullDetailFootprint,
    )
    .clamp(0, 1);
  const detailAttenuation = detailT
    .mul(detailT)
    .mul(detailT.mul(-2).add(3))
    .oneMinus();
  return {
    cutDepth: ridge
      .mul(sideTaper)
      .mul(detailAttenuation)
      .mul(TOP_EDGE_ALPHA_CUTOUT_V1.maximumDepth),
    contourSignal: ridge
      .sub(0.5)
      .mul(sideTaper)
      .mul(detailAttenuation),
  };
}

function createKeepMaskNode(uvNode: any, cutDepth: any) {
  return uvNode.y.lessThanEqual((float as any)(1).sub(cutDepth));
}

export function createTopEdgeAlphaCutoutMasks(
  uvNode: any,
): TopEdgeAlphaCutoutMasks {
  const petalDetail = createDetailNodes(
    uvNode,
    stableInstancePhaseNode((float as any)(0)),
  );
  const flowerDetail = createDetailNodes(
    uvNode,
    stableInstancePhaseNode(instanceIndex as any),
  );
  return {
    petal: createKeepMaskNode(uvNode, petalDetail.cutDepth),
    flower: createKeepMaskNode(uvNode, flowerDetail.cutDepth),
    petalCutDepth: petalDetail.cutDepth,
    flowerCutDepth: flowerDetail.cutDepth,
    petalDetailSignal: petalDetail.contourSignal,
    flowerDetailSignal: flowerDetail.contourSignal,
  };
}
