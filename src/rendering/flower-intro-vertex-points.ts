import {
  mix,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';

type FlowerIntroVertexPointInputs = {
  gridNode: any;
  instanceIndexNode: any;
  elapsedSecondsNode: any;
  revealNode: any;
  digitalEnergyNode: any;
  screenSpaceScaleNode: any;
};

function gridVertexDistancePixels(gridNode: any) {
  const centered = gridNode
    .add(0.5)
    .fract()
    .sub(0.5);
  const footprint = (vec2 as any)(
    gridNode.x.fwidth().max(0.000001),
    gridNode.y.fwidth().max(0.000001),
  );
  return centered.div(footprint).dot(
    centered.div(footprint),
  ).sqrt();
}

export function createFlowerIntroVertexPointLayer({
  gridNode,
  instanceIndexNode,
  elapsedSecondsNode,
  revealNode,
  digitalEnergyNode,
  screenSpaceScaleNode,
}: FlowerIntroVertexPointInputs) {
  const vertexGridNode = gridNode.add(0.5).floor();
  const vertexSeedNode = (sin as any)(
    instanceIndexNode
      .add(1)
      .mul(73.139)
      .add(vertexGridNode.x.mul(29.417))
      .add(vertexGridNode.y.mul(43.733)),
  )
    .mul(43758.5453)
    .fract();
  const densityNode = (smoothstep as any)(
    0.64,
    0.8,
    vertexSeedNode,
  );
  const flickerNode = (sin as any)(
    elapsedSecondsNode
      .mul(vertexSeedNode.mul(2.8).add(2.4))
      .add(vertexSeedNode.mul(Math.PI * 2)),
  )
    .mul(0.5)
    .add(0.5);
  const brightnessNode = flickerNode
    .pow(4)
    .mul(0.46)
    .add(vertexSeedNode.mul(0.22))
    .add(0.58);
  const radialPixelsNode = gridVertexDistancePixels(gridNode);
  const coreNode = radialPixelsNode
    .smoothstep(
      screenSpaceScaleNode.mul(0.36),
      screenSpaceScaleNode.mul(3.8),
    )
    .oneMinus();
  const haloNode = radialPixelsNode
    .smoothstep(
      screenSpaceScaleNode.mul(1.4),
      screenSpaceScaleNode.mul(6.4),
    )
    .oneMinus()
    .mul(0.46);
  const intensityNode = coreNode
    .add(haloNode)
    .mul(densityNode)
    .mul(revealNode)
    .mul(digitalEnergyNode)
    .mul(brightnessNode);
  const iceBlueNode = (vec3 as any)(0.04, 0.38, 1);
  const whiteNode = (vec3 as any)(0.42, 0.72, 1);
  const colorNode = (mix as any)(
    iceBlueNode,
    whiteNode,
    vertexSeedNode.mul(0.62).add(0.24),
  );

  return {
    colorNode,
    intensityNode,
  };
}
