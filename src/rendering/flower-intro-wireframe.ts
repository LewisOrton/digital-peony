import {
  mix,
  sin,
  vec3,
} from 'three/tsl';

type FlowerIntroWireframeInputs = {
  gridNode: any;
  instanceIndexNode: any;
  elapsedSecondsNode: any;
  digitalEnergyNode: any;
  screenSpaceScaleNode: any;
};

function gridLineDistancePixels(coordinateNode: any) {
  const centered = coordinateNode
    .add(0.5)
    .fract()
    .sub(0.5)
    .abs();
  return centered.div(
    coordinateNode.fwidth().max(0.000001),
  );
}

function edgeSeedNode(
  instanceIndexNode: any,
  gridColumnNode: any,
  gridRowNode: any,
  orientation: number,
) {
  return (sin as any)(
    instanceIndexNode
      .add(1)
      .mul(61.137)
      .add(gridColumnNode.mul(23.771))
      .add(gridRowNode.mul(47.117))
      .add(orientation * 83.713),
  )
    .mul(43758.5453)
    .fract();
}

function edgeBrightnessNode(
  seedNode: any,
  elapsedSecondsNode: any,
) {
  const cadenceNode = seedNode.mul(2).add(1.55);
  const flickerNode = (sin as any)(
    elapsedSecondsNode
      .mul(cadenceNode)
      .add(seedNode.mul(Math.PI * 2)),
  )
    .mul(0.5)
    .add(0.5);
  return flickerNode
    .pow(5)
    .mul(0.38)
    .add(seedNode.mul(0.14))
    .add(0.62);
}

function edgeColorNode(seedNode: any) {
  return (mix as any)(
    (vec3 as any)(0.02, 0.32, 1),
    (vec3 as any)(0.38, 0.68, 1),
    seedNode.mul(0.58).add(0.26),
  );
}

export function createFlowerIntroWireframeLayer({
  gridNode,
  instanceIndexNode,
  elapsedSecondsNode,
  digitalEnergyNode,
  screenSpaceScaleNode,
}: FlowerIntroWireframeInputs) {
  const cellNode = gridNode.floor();
  const verticalColumnNode = gridNode.x.add(0.5).floor();
  const horizontalRowNode = gridNode.y.add(0.5).floor();
  const verticalSeedNode = edgeSeedNode(
    instanceIndexNode,
    verticalColumnNode,
    cellNode.y,
    0,
  );
  const horizontalSeedNode = edgeSeedNode(
    instanceIndexNode,
    cellNode.x,
    horizontalRowNode,
    1,
  );
  const diagonalSeedNode = edgeSeedNode(
    instanceIndexNode,
    cellNode.x,
    cellNode.y,
    2,
  );
  const verticalMaskNode = gridLineDistancePixels(gridNode.x)
    .smoothstep(
      screenSpaceScaleNode.mul(0.34),
      screenSpaceScaleNode.mul(0.84),
    )
    .oneMinus();
  const horizontalMaskNode = gridLineDistancePixels(gridNode.y)
    .smoothstep(
      screenSpaceScaleNode.mul(0.34),
      screenSpaceScaleNode.mul(0.84),
    )
    .oneMinus();
  const diagonalMaskNode = gridLineDistancePixels(
    gridNode.x.sub(gridNode.y),
  )
    .smoothstep(
      screenSpaceScaleNode.mul(0.3),
      screenSpaceScaleNode.mul(0.76),
    )
    .oneMinus()
    .mul(0.46);
  const verticalIntensityNode = verticalMaskNode.mul(
    edgeBrightnessNode(verticalSeedNode, elapsedSecondsNode),
  );
  const horizontalIntensityNode = horizontalMaskNode.mul(
    edgeBrightnessNode(horizontalSeedNode, elapsedSecondsNode),
  );
  const diagonalIntensityNode = diagonalMaskNode.mul(
    edgeBrightnessNode(diagonalSeedNode, elapsedSecondsNode),
  );
  const combinedIntensityNode = verticalIntensityNode
    .add(horizontalIntensityNode)
    .add(diagonalIntensityNode)
    .clamp(0, 1.35)
    .mul(digitalEnergyNode);
  const weightedColorNode = edgeColorNode(verticalSeedNode)
    .mul(verticalIntensityNode)
    .add(
      edgeColorNode(horizontalSeedNode).mul(
        horizontalIntensityNode,
      ),
    )
    .add(
      edgeColorNode(diagonalSeedNode).mul(
        diagonalIntensityNode,
      ),
    )
    .div(
      verticalIntensityNode
        .add(horizontalIntensityNode)
        .add(diagonalIntensityNode)
        .max(0.0001),
    );

  return {
    colorNode: weightedColorNode,
    intensityNode: combinedIntensityNode,
  };
}
