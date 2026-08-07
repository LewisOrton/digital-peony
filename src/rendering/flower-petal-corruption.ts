// @ts-nocheck -- TSL graph nodes are runtime-validated by the WebGPU build.
import * as THREE from 'three/webgpu';
import {
  attribute,
  float,
  instanceIndex,
  mix,
  sin,
  smoothstep,
  uniform,
  uint,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { PETAL_GEOMETRY } from '../geometry/geometry-contract';
import {
  FLOWER_CONTACT_SESSION,
  type FlowerContactSessionSnapshot,
} from '../interaction/flower-contact-session';

export const FLOWER_PETAL_CORRUPTION = Object.freeze({
  gridHalfWidthPixels: 0.9,
  gridFeatherPixels: 0.55,
  blockCadencePerSecond: 12,
});

function gridLineDistancePixels(coordinateNode: any) {
  const centered = coordinateNode
    .add(0.5)
    .fract()
    .sub(0.5)
    .abs();
  return centered.div(coordinateNode.fwidth().max(0.000001));
}

function artifactSeed(
  cellNode: any,
  salt: number,
  petalIndexNode: any,
  timeSliceNode: any,
) {
  return (sin as any)(
    cellNode.x
      .mul(41.713 + salt * 7.31)
      .add(cellNode.y.mul(89.221 + salt * 11.17))
      .add((float as any)(petalIndexNode).mul(67.419 + salt * 5.47))
      .add(timeSliceNode.mul(17.117 + salt * 3.13)),
  )
    .mul(43758.5453)
    .fract();
}

function artifactBlock(
  coordinateNode: any,
  scale: any,
  salt: number,
  density: number,
  petalIndexNode: any,
  timeSliceNode: any,
) {
  const cell = coordinateNode.mul(scale).floor();
  const local = coordinateNode.mul(scale).fract().sub(0.5).abs();
  const seed = artifactSeed(cell, salt, petalIndexNode, timeSliceNode);
  const aspect = artifactSeed(cell, salt + 0.37, petalIndexNode, timeSliceNode);
  const opacity = (mix as any)(
    0.2,
    1,
    artifactSeed(cell, salt + 0.71, petalIndexNode, (float as any)(0)),
  );
  const halfWidth = (mix as any)(0.07, 0.47, seed);
  const halfHeight = (mix as any)(0.035, 0.42, aspect);
  const interior = local.x
    .smoothstep(halfWidth, halfWidth.add(0.045))
    .oneMinus()
    .mul(
      local.y
        .smoothstep(halfHeight, halfHeight.add(0.045))
        .oneMinus(),
    );
  return (smoothstep as any)(density, 0.97, seed).mul(interior).mul(opacity);
}

export function createFlowerPetalCorruption({
  positionNode,
  realColorNode,
  realMaskNode,
}: {
  positionNode: any;
  realColorNode: any;
  realMaskNode: any;
}) {
  const corruptedPetalLowMaskNode: any = (uniform as any)(0, 'uint');
  const corruptedPetalHighMaskNode: any = (uniform as any)(0, 'uint');
  const warningPetalNode: any = (uniform as any)(0, 'uint');
  const phaseNode: any = (uniform as any)(0);
  const elapsedSecondsNode: any = (uniform as any)(0);
  const instanceMask = instanceIndex
    .lessThan((uint as any)(32))
    .select(corruptedPetalLowMaskNode, corruptedPetalHighMaskNode);
  const selectedMask = instanceMask
    .bitAnd(
      (uint as any)(1).shiftLeft(instanceIndex.mod((uint as any)(32))),
    )
    .greaterThan((uint as any)(0))
    .select(1, 0);
  const warningMask = instanceIndex
    .equal(warningPetalNode)
    .select(1, 0);
  const initialInversion = phaseNode
    .greaterThan(0)
    .and(phaseNode.lessThan(FLOWER_CONTACT_SESSION.inversionSeconds))
    .select(1, 0)
    .mul(warningMask);
  const stutterWindow = phaseNode
    .greaterThanEqual(FLOWER_CONTACT_SESSION.inversionSeconds)
    .and(
      phaseNode.lessThan(
        FLOWER_CONTACT_SESSION.inversionSeconds +
          FLOWER_CONTACT_SESSION.corruptionStutterSeconds,
      ),
    );
  const stutterInversion = phaseNode
    .sub(FLOWER_CONTACT_SESSION.inversionSeconds)
    .mul(FLOWER_CONTACT_SESSION.corruptionStutterHertz)
    .floor()
    .mod(2)
    .equal(0)
    .select(1, 0)
    .mul(stutterWindow.select(1, 0))
    .mul(warningMask);
  const inversion = initialInversion.add(stutterInversion).clamp(0, 1);
  const broken = selectedMask.sub(inversion).clamp(0, 1);
  const uvNode: any = (uv as any)();
  const shapeGridNode: any = attribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
    'vec3',
  );
  const gridNode = shapeGridNode.yz;
  const diagonal = gridNode.x.sub(gridNode.y);
  const gridDistance = gridLineDistancePixels(gridNode.x)
    .min(gridLineDistancePixels(gridNode.y))
    .min(gridLineDistancePixels(diagonal));
  const grid = gridDistance
    .smoothstep(
      FLOWER_PETAL_CORRUPTION.gridHalfWidthPixels,
      FLOWER_PETAL_CORRUPTION.gridHalfWidthPixels +
        FLOWER_PETAL_CORRUPTION.gridFeatherPixels,
    )
    .oneMinus();
  const timeSlice = elapsedSecondsNode
    .mul(FLOWER_PETAL_CORRUPTION.blockCadencePerSecond)
    .floor();
  const horizontalBlocks = artifactBlock(
    uvNode,
    (vec2 as any)(8, 31),
    0.11,
    0.61,
    instanceIndex,
    timeSlice,
  );
  const verticalBlocks = artifactBlock(
    (vec2 as any)(uvNode.y, uvNode.x),
    (vec2 as any)(27, 7),
    1.23,
    0.67,
    instanceIndex,
    timeSlice,
  );
  const diagonalBlocks = artifactBlock(
    (vec2 as any)(
      uvNode.x.add(uvNode.y.mul(0.58)),
      uvNode.y.sub(uvNode.x.mul(0.36)),
    ),
    (vec2 as any)(16, 13),
    2.47,
    0.76,
    instanceIndex,
    timeSlice,
  );
  const largeBlocks = artifactBlock(
    uvNode,
    (vec2 as any)(5, 6),
    3.61,
    0.83,
    instanceIndex,
    timeSlice,
  );
  const blockSignal = horizontalBlocks
    .add(verticalBlocks)
    .add(diagonalBlocks)
    .add(largeBlocks)
    .clamp(0, 1);
  const blockSeed = artifactSeed(
    uvNode.mul((vec2 as any)(13, 19)).floor(),
    4.79,
    instanceIndex,
    timeSlice,
  );
  const scanBand = uvNode.y
    .mul(22)
    .add(timeSlice.mul(0.37))
    .fract()
    .sub(0.5)
    .abs()
    .smoothstep(0.04, 0.12)
    .oneMinus();
  const invertedColor = realColorNode.oneMinus().mul(0.92);
  const brokenBase = (vec3 as any)(0.025, 0.001, 0.004);
  const gridRed = (vec3 as any)(0.9, 0.015, 0.03);
  const artifactRed = (vec3 as any)(1.0, 0.06, 0.025);
  const brokenColor = brokenBase
    .add(gridRed.mul(grid.mul(0.78)))
    .add(artifactRed.mul(blockSignal.mul(0.92)))
    .add(gridRed.mul(scanBand.mul(0.16)))
    .clamp(0, 1.2);
  const transitionColor = inversion.select(invertedColor, brokenColor);
  const overlayOpacity = inversion.add(broken).clamp(0, 1);
  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.positionNode = positionNode;
  material.colorNode = transitionColor;
  material.opacityNode = overlayOpacity;
  material.maskNode = realMaskNode;
  material.forceSinglePass = true;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;

  const wireframeMaterial = new THREE.MeshBasicNodeMaterial({
    color: 0xff1738,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    wireframe: true,
  });
  wireframeMaterial.positionNode = positionNode;
  wireframeMaterial.colorNode = (mix as any)(
    (vec3 as any)(0.32, 0.002, 0.008),
    artifactRed,
    blockSeed.mul(0.58),
  );
  wireframeMaterial.opacityNode = selectedMask
    .mul(broken)
    .mul(0.82);
  wireframeMaterial.maskNode = realMaskNode;
  wireframeMaterial.forceSinglePass = true;
  wireframeMaterial.polygonOffset = true;
  wireframeMaterial.polygonOffsetFactor = -2;
  wireframeMaterial.polygonOffsetUnits = -2;
  let active = false;

  function update(
    timestamp: number,
    snapshot: FlowerContactSessionSnapshot,
  ) {
    elapsedSecondsNode.value = timestamp / 1000;
    phaseNode.value = snapshot.corruptionPhase;
    corruptedPetalLowMaskNode.value = snapshot.corruptedPetalMasks.low;
    corruptedPetalHighMaskNode.value = snapshot.corruptedPetalMasks.high;
    if (snapshot.corruptedPetalIndex >= 0) {
      warningPetalNode.value = snapshot.corruptedPetalIndex;
    }
    active =
      snapshot.corruptedPetalMasks.low !== 0 ||
      snapshot.corruptedPetalMasks.high !== 0;
  }

  function dispose() {
    material.dispose();
    wireframeMaterial.dispose();
  }

  return {
    material,
    wireframeMaterial,
    update,
    dispose,
    get active() {
      return active;
    },
  };
}
