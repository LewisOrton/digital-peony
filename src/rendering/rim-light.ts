import {
  float,
  fwidth,
  mix,
  smoothstep,
  vec3,
} from 'three/tsl';

export const RIM_LIGHT = {
  minimumStrength: 0,
  maximumStrength: 1,
  step: 0.02,
  defaultStrength: 0,
  bandWidth: 0.02,
  maximumAntialiasWidth: 0.0025,
  topContourShift: 0.0015,
  topShoulderStart: 0.08,
  topCenterFull: 0.42,
  topShoulderFloor: 0.35,
  sideRootStart: 0.08,
  sideRootFull: 0.3,
  sideStrength: 0.5,
  angularExponent: 1.5,
  colorLift: 0.22,
} as const;

type RimLightNodeInputs = {
  uvNode: any;
  topEdgeCutDepthNode: any;
  topEdgeDetailSignalNode: any;
  worldNormalNode: any;
  visibleFaceDirectionNode: any;
  lightDirectionNode: any;
  petalColorNode: any;
  strengthNode: any;
};

function edgeBandNode(distanceNode: any) {
  const antialiasWidth = (fwidth as any)(distanceNode)
    .mul(0.5)
    .min(RIM_LIGHT.maximumAntialiasWidth);
  return (smoothstep as any)(
    antialiasWidth,
    RIM_LIGHT.bandWidth,
    distanceNode,
  ).oneMinus();
}

export function createRimLightNode({
  uvNode,
  topEdgeCutDepthNode,
  topEdgeDetailSignalNode,
  worldNormalNode,
  visibleFaceDirectionNode,
  lightDirectionNode,
  petalColorNode,
  strengthNode,
}: RimLightNodeInputs) {
  const makeFloat = float as (...values: any[]) => any;
  const makeVec3 = vec3 as (...values: any[]) => any;
  const sideDistance = uvNode.x.min(uvNode.x.oneMinus());
  const topDistance = uvNode.y
    .oneMinus()
    .sub(topEdgeCutDepthNode)
    .add(
      topEdgeDetailSignalNode.mul(RIM_LIGHT.topContourShift),
    );
  const topCenter = (mix as any)(
    RIM_LIGHT.topShoulderFloor,
    1,
    (smoothstep as any)(
      RIM_LIGHT.topShoulderStart,
      RIM_LIGHT.topCenterFull,
      sideDistance,
    ),
  );
  const topMask = edgeBandNode(topDistance).mul(topCenter);
  const sideMask = edgeBandNode(sideDistance)
    .mul(
      (smoothstep as any)(
        RIM_LIGHT.sideRootStart,
        RIM_LIGHT.sideRootFull,
        uvNode.y,
      ),
    )
    .mul(RIM_LIGHT.sideStrength);
  const spatialMask = topMask
    .oneMinus()
    .mul(sideMask.oneMinus())
    .oneMinus();
  const reverseLightGate = worldNormalNode
    .mul(visibleFaceDirectionNode)
    .negate()
    .dot(lightDirectionNode)
    .max(0)
    .pow(RIM_LIGHT.angularExponent);
  const liftedPetalColor = (mix as any)(
    petalColorNode,
    makeVec3(1),
    RIM_LIGHT.colorLift,
  );
  return liftedPetalColor
    .mul(spatialMask)
    .mul(reverseLightGate)
    .mul(makeFloat(strengthNode));
}
