import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cos,
  float,
  instanceIndex,
  mix,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import {
  buildPetalGeometry,
  type ReadonlyPetalGeometrySettings,
} from '../geometry/petal';
import {
  deformFlowerPetalPointWithWrinkle,
  stableCreasePhase,
  type FlowerModeSettings,
} from '../geometry/flower-mode';
import { PETAL_LOOKDEV } from './petal-lookdev-contract';
import { signedNoise2DNodes } from './noise-nodes';
import { FLOWER_STAGE_THREE_BACKGROUND } from './flower-stage-three-background-contract';
import {
  FLOWER_STAGE_THREE_BACKGROUND_SETTINGS,
  FLOWER_STAGE_THREE_BACKGROUND_MAX_PETALS,
  type FlowerStageThreeBackgroundSettings,
} from './flower-stage-three-background-settings';
import {
  STAGE_THREE_GLYPH_INDICES,
  STAGE_THREE_GLYPH_KINDS,
  STAGE_THREE_GLYPH_POSITIONS,
} from './flower-stage-three-glyph-geometry';

const BACKGROUND_PETAL_CREASE_AMPLITUDE_SCALE = 1.5;
const BACKGROUND_PETAL_WRINKLE_AMPLITUDE_SCALE = 1.5;
const BACKGROUND_PETAL_HORIZONTAL_EXTENT = 1.18;

export function createFlowerStageThreeBackgroundGraphics({
  scene,
  camera,
  backlightStrengthNode,
  rimLightStrengthNode,
  initialSettings,
  petalSettings,
  flowerSettings,
  densityScale,
}: {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  backlightStrengthNode: any;
  rimLightStrengthNode: any;
  initialSettings: FlowerStageThreeBackgroundSettings;
  petalSettings: ReadonlyPetalGeometrySettings;
  flowerSettings: FlowerModeSettings;
  densityScale: (cameraAspect: number) => number;
}) {
  const maximumPaddedLongAxis =
    FLOWER_STAGE_THREE_BACKGROUND.maximumLongAxisCells +
    FLOWER_STAGE_THREE_BACKGROUND.overscanCells * 2;
  const maximumPaddedShortAxis =
    FLOWER_STAGE_THREE_BACKGROUND.maximumShortAxisCells +
    FLOWER_STAGE_THREE_BACKGROUND.overscanCells * 2;
  const maximumInstances =
    maximumPaddedLongAxis * maximumPaddedShortAxis;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(STAGE_THREE_GLYPH_POSITIONS, 3),
  );
  geometry.setAttribute(
    'glyphKind',
    new THREE.BufferAttribute(STAGE_THREE_GLYPH_KINDS, 1),
  );
  geometry.setIndex(
    new THREE.BufferAttribute(STAGE_THREE_GLYPH_INDICES, 1),
  );
  const cellPositions = new Float32Array(maximumInstances * 2);
  const rowDirections = new Float32Array(maximumInstances);
  const columnDirections = new Float32Array(maximumInstances);
  const selectedGlyphs = new Float32Array(maximumInstances);
  const cellPositionAttribute = new THREE.InstancedBufferAttribute(
    cellPositions,
    2,
  );
  const rowDirectionAttribute = new THREE.InstancedBufferAttribute(
    rowDirections,
    1,
  );
  const columnDirectionAttribute = new THREE.InstancedBufferAttribute(
    columnDirections,
    1,
  );
  const selectedGlyphAttribute = new THREE.InstancedBufferAttribute(
    selectedGlyphs,
    1,
  );
  geometry.setAttribute('stageThreeCellPosition', cellPositionAttribute);
  geometry.setAttribute('stageThreeRowDirection', rowDirectionAttribute);
  geometry.setAttribute('stageThreeColumnDirection', columnDirectionAttribute);
  geometry.setAttribute('stageThreeSelectedGlyph', selectedGlyphAttribute);

  const gridNode: any = (uniform as any)(new THREE.Vector2(5, 5));
  const gridLayoutPitchNode: any = (uniform as any)(
    new THREE.Vector2(1, 1),
  );
  const glyphScaleNode: any = (uniform as any)(new THREE.Vector2(1, 1));
  const horizontalProgressNode: any = (uniform as any)(0);
  const verticalProgressNode: any = (uniform as any)(0);
  const windStrengthNode: any = (uniform as any)(
    initialSettings.windStrength,
  );
  const windSpeedNode: any = (uniform as any)(initialSettings.windSpeed);
  const brightnessNode: any = (uniform as any)(initialSettings.brightness);
  const transitionOpacityNode: any = (uniform as any)(1);
  const cellPosition: any = (attribute as any)('stageThreeCellPosition');
  const rowDirection: any = (attribute as any)('stageThreeRowDirection');
  const columnDirection: any = (attribute as any)(
    'stageThreeColumnDirection',
  );
  const selectedGlyph: any = (attribute as any)('stageThreeSelectedGlyph');
  const displayColumn: any = cellPosition.x.add(
    rowDirection.mul(horizontalProgressNode),
  );
  const displayRow: any = cellPosition.y.add(
    columnDirection.mul(verticalProgressNode),
  );
  const glyphKind: any = (attribute as any)('glyphKind');
  const glyphVisible: any = glyphKind
    .sub(selectedGlyph)
    .abs()
    .lessThan(0.5)
    .select(1, 0);
  const cellCenter: any = (vec2 as any)(
    displayColumn.add(0.5),
    displayRow.add(0.5),
  );
  const glyphOffset: any = (positionLocal as any).xy
    .mul(glyphScaleNode)
    .mul(FLOWER_STAGE_THREE_BACKGROUND.glyphFill);
  const cellCenterNdc: any = cellCenter
    .sub(gridNode.mul(0.5))
    .div(gridNode)
    .mul(2)
    .mul(gridLayoutPitchNode);
  const glyphOffsetNdc: any = glyphOffset
    .div(gridNode)
    .mul(2);
  const carrierPosition: any = cellCenterNdc.add(glyphOffsetNdc);
  const collapsedPosition: any = cellCenterNdc;

  const maskMaterial: any = new THREE.MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  maskMaterial.positionNode = (vec3 as any)(
    (mix as any)(collapsedPosition, carrierPosition, glyphVisible),
    0,
  );
  maskMaterial.colorWrite = false;
  maskMaterial.stencilWrite = true;
  maskMaterial.stencilRef = 1;
  maskMaterial.stencilFunc = THREE.EqualStencilFunc;
  maskMaterial.stencilFail = THREE.KeepStencilOp;
  maskMaterial.stencilZFail = THREE.KeepStencilOp;
  maskMaterial.stencilZPass = THREE.IncrementWrapStencilOp;

  const revealMaterial: any = new THREE.MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  revealMaterial.colorWrite = false;
  revealMaterial.stencilWrite = true;
  revealMaterial.stencilRef = 1;
  revealMaterial.stencilFunc = THREE.AlwaysStencilFunc;
  revealMaterial.stencilFail = THREE.KeepStencilOp;
  revealMaterial.stencilZFail = THREE.KeepStencilOp;
  revealMaterial.stencilZPass = THREE.ReplaceStencilOp;
  const revealMesh = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    revealMaterial,
  );
  revealMesh.name = 'Flower Stage 3 Circular Reveal Stencil';
  revealMesh.visible = false;
  revealMesh.frustumCulled = false;
  revealMesh.castShadow = false;
  revealMesh.receiveShadow = false;
  revealMesh.renderOrder = -11;

  const maskMesh = new THREE.InstancedMesh(
    geometry,
    maskMaterial,
    maximumInstances,
  );
  maskMesh.name = 'Flower Stage 3 Glyph Stencil Mask';
  maskMesh.visible = false;
  maskMesh.frustumCulled = false;
  maskMesh.castShadow = false;
  maskMesh.receiveShadow = false;
  maskMesh.renderOrder = -10;
  const identity = new THREE.Matrix4();
  for (let index = 0; index < maskMesh.count; index += 1) {
    maskMesh.setMatrixAt(index, identity);
  }
  maskMesh.instanceMatrix.needsUpdate = true;

  const backgroundPetalGeometry = buildPetalGeometry({
    ...petalSettings,
    subdivisionsX: Math.floor(petalSettings.subdivisionsX * 0.75),
    subdivisionsY: Math.floor(petalSettings.subdivisionsY * 0.5),
    height: petalSettings.height,
    sideProfile: petalSettings.sideProfile.map(
      (point): [number, number] => [point[0], point[1]],
    ),
    topProfile: petalSettings.topProfile.map(
      (point): [number, number] => [point[0], point[1]],
    ),
  });
  const petalPositionAttribute = backgroundPetalGeometry.getAttribute(
    'position',
  ) as THREE.BufferAttribute;
  const petalUvAttribute = backgroundPetalGeometry.getAttribute(
    'uv',
  ) as THREE.BufferAttribute;
  const backgroundPetalCreasePhase = stableCreasePhase(0);
  for (let index = 0; index < petalPositionAttribute.count; index += 1) {
    const u = petalUvAttribute.getX(index);
    const v = petalUvAttribute.getY(index);
    const position = new THREE.Vector3(
      petalPositionAttribute.getX(index),
      petalPositionAttribute.getY(index),
      petalPositionAttribute.getZ(index),
    );
    const curvedPosition = deformFlowerPetalPointWithWrinkle(
      position,
      u,
      u,
      v,
      backgroundPetalCreasePhase,
      1,
      flowerSettings.creaseFrequency,
      flowerSettings.creaseAmplitude *
        BACKGROUND_PETAL_CREASE_AMPLITUDE_SCALE,
      flowerSettings.wrinkleFrequency,
      flowerSettings.wrinkleAmplitude *
        BACKGROUND_PETAL_WRINKLE_AMPLITUDE_SCALE,
    );
    petalPositionAttribute.setXYZ(
      index,
      curvedPosition.x,
      curvedPosition.y,
      curvedPosition.z,
    );
  }
  petalPositionAttribute.needsUpdate = true;
  backgroundPetalGeometry.computeVertexNormals();
  backgroundPetalGeometry.computeBoundingSphere();

  const backgroundPetalCount = FLOWER_STAGE_THREE_BACKGROUND_MAX_PETALS;
  const petalFlowPhases = new Float32Array(backgroundPetalCount);
  const petalFlowPhaseAttribute = new THREE.InstancedBufferAttribute(
    petalFlowPhases,
    1,
  );
  backgroundPetalGeometry.setAttribute(
    'stageThreePetalFlowPhase',
    petalFlowPhaseAttribute,
  );

  const petalTimeNode: any = (uniform as any)(0);
  const keyLightDirectionNode: any = (uniform as any)(
    new THREE.Vector3(3, 4, 5).normalize(),
  );
  const keyLightColorNode: any = (uniform as any)(
    new THREE.Color(1, 1, 1),
  );
  const petalUvNode: any = (uv as any)();
  const petalSeedNode: any = (float as any)(instanceIndex);
  const petalFlowPhaseNode: any = (attribute as any)(
    'stageThreePetalFlowPhase',
  );
  const stableSeed: any = (sin as any)(
    petalSeedNode.add(1).mul(PETAL_LOOKDEV.seed.indexScale),
  ).mul(PETAL_LOOKDEV.seed.hashScale).fract();
  const scaledTime: any = petalTimeNode.mul(windSpeedNode);
  const broadFlowPhase: any = scaledTime.mul(1.58).add(petalFlowPhaseNode);
  const primaryFlow: any = (sin as any)(
    broadFlowPhase,
  );
  const primaryCrossFlow: any = (cos as any)(
    broadFlowPhase,
  );
  const independentOrbitPhase: any = scaledTime
    .mul(stableSeed.mul(0.32).add(1.72))
    .add(stableSeed.mul(Math.PI * 2));
  const secondaryFlow: any = (sin as any)(
    independentOrbitPhase,
  );
  const secondaryCrossFlow: any = (cos as any)(
    independentOrbitPhase,
  );
  const flutterAngle: any = (sin as any)(
    scaledTime.mul(stableSeed.mul(0.55).add(1.08))
      .add(stableSeed.mul(Math.PI * 2)),
  ).mul(stableSeed.mul(0.04).add(0.055)).mul(windStrengthNode);
  const flutterCos: any = (cos as any)(flutterAngle);
  const flutterSin: any = (sin as any)(flutterAngle);
  const rotatedX: any = (positionLocal as any).x.mul(flutterCos)
    .sub((positionLocal as any).y.mul(flutterSin));
  const rotatedY: any = (positionLocal as any).x.mul(flutterSin)
    .add((positionLocal as any).y.mul(flutterCos));
  const petalBend: any = petalUvNode.y.pow(1.7);
  const flowX: any = primaryFlow.mul(0.14)
    .add(secondaryFlow.mul(0.018))
    .mul(windStrengthNode);
  const flowY: any = primaryCrossFlow.mul(0.09)
    .add(secondaryCrossFlow.mul(0.014))
    .mul(windStrengthNode);
  const flowingTip: any = primaryFlow.mul(0.055)
    .add(secondaryFlow.mul(0.012))
    .mul(petalBend)
    .mul(windStrengthNode);
  const petalPosition: any = (vec3 as any)(
    rotatedX.add(flowX).add(flowingTip),
    rotatedY.add(flowY),
    (positionLocal as any).z.add(
      secondaryFlow.mul(0.025).mul(petalBend).mul(windStrengthNode),
    ),
  );
  const broadColorNoise: any = signedNoise2DNodes(
    petalUvNode.x.mul(PETAL_LOOKDEV.albedo.lowFrequencyU)
      .add(stableSeed.mul(PETAL_LOOKDEV.albedo.lowSeedU)),
    petalUvNode.y.mul(PETAL_LOOKDEV.albedo.lowFrequencyV)
      .add(stableSeed.mul(PETAL_LOOKDEV.albedo.lowSeedV)),
  ).signedNoise.div(0.7).clamp(-1, 1);
  const gradientCoordinate: any = petalUvNode.y
    .add(broadColorNoise.mul(PETAL_LOOKDEV.gradient.boundaryLowNoise))
    .clamp(0, 1);
  const [rootStop, pinkStartStop, pinkEndStop, tipStop] =
    PETAL_LOOKDEV.colorStops;
  const rootColor = new THREE.Color(rootStop.color);
  const pinkStartColor = new THREE.Color(pinkStartStop.color);
  const pinkEndColor = new THREE.Color(pinkEndStop.color);
  const tipColor = new THREE.Color(tipStop.color);
  const rootToPink: any = (smoothstep as any)(
    rootStop.position,
    pinkStartStop.position,
    gradientCoordinate,
  );
  const pinkBandAmount: any = (smoothstep as any)(
    pinkStartStop.position,
    pinkEndStop.position,
    gradientCoordinate,
  );
  const tipAmount: any = (smoothstep as any)(
    pinkEndStop.position,
    tipStop.position,
    gradientCoordinate,
  );
  const gradientColor: any = (mix as any)(
    (mix as any)(
      (mix as any)(
        (vec3 as any)(rootColor.r, rootColor.g, rootColor.b),
        (vec3 as any)(
          pinkStartColor.r,
          pinkStartColor.g,
          pinkStartColor.b,
        ),
        rootToPink,
      ),
      (vec3 as any)(pinkEndColor.r, pinkEndColor.g, pinkEndColor.b),
      pinkBandAmount,
    ),
    (vec3 as any)(tipColor.r, tipColor.g, tipColor.b),
    tipAmount,
  );
  const materialVariation: any = broadColorNoise.mul(0.13)
    .add(stableSeed.sub(0.5).mul(0.05))
    .add(1);
  const petalColor: any = gradientColor
    .mul(materialVariation)
    .mul(brightnessNode)
    .clamp(0, 1.35);
  const petalViewDirection: any = (cameraPosition as any)
    .sub(positionWorld as any)
    .normalize();
  const petalRim: any = (normalWorld as any)
    .dot(petalViewDirection)
    .abs()
    .oneMinus().pow(2.15)
    .mul(
      (normalWorld as any).dot(keyLightDirectionNode)
        .abs().mul(0.55).add(0.45),
    );
  const petalBacklight: any = (normalWorld as any)
    .negate().dot(keyLightDirectionNode)
    .max(0).pow(1.4)
    .mul(petalUvNode.y.mul(0.24).add(0.78));
  const petalGeometrySelfShade: any = (normalWorld as any)
    .dot(keyLightDirectionNode)
    .mul(0.5)
    .add(0.5)
    .clamp(0, 1)
    .pow(1.7)
    .mul(0.7)
    .add(0.3);
  const petalMaterial: any = new THREE.MeshPhysicalNodeMaterial({
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0,
    ior: 1.55,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    side: THREE.DoubleSide,
  });
  petalMaterial.positionNode = petalPosition;
  petalMaterial.opacityNode = transitionOpacityNode;
  petalMaterial.colorNode = petalColor.mul(petalGeometrySelfShade);
  petalMaterial.roughnessNode = broadColorNoise.mul(0.025)
    .add(0.16).clamp(0.12, 0.21);
  petalMaterial.emissiveNode = petalColor.mul(keyLightColorNode).mul(
    petalBacklight.mul(0.29).mul(backlightStrengthNode)
      .add(petalRim.mul(0.36).mul(rimLightStrengthNode)),
  );
  petalMaterial.stencilWrite = true;
  petalMaterial.stencilWriteMask = 0;
  petalMaterial.stencilRef = 2;
  petalMaterial.stencilFunc = THREE.EqualStencilFunc;
  petalMaterial.stencilFail = THREE.KeepStencilOp;
  petalMaterial.stencilZFail = THREE.KeepStencilOp;
  petalMaterial.stencilZPass = THREE.KeepStencilOp;

  function drawnPetalCount(density: number, cameraAspect: number) {
    return Math.min(
      backgroundPetalCount,
      Math.round(
        density * backgroundPetalCount /
          FLOWER_STAGE_THREE_BACKGROUND_SETTINGS.maximumDensity *
          densityScale(cameraAspect),
      ),
    );
  }
  const petalMesh = new THREE.InstancedMesh(
    backgroundPetalGeometry,
    petalMaterial,
    backgroundPetalCount,
  );
  petalMesh.name = 'Flower Stage 3 Masked Petal Field';
  petalMesh.visible = false;
  petalMesh.frustumCulled = false;
  petalMesh.castShadow = false;
  petalMesh.receiveShadow = false;
  petalMesh.renderOrder = -9;
  petalMesh.count = drawnPetalCount(
    initialSettings.petalCount,
    camera.aspect,
  );
  scene.add(revealMesh, maskMesh, petalMesh);


  return {
    maximumInstances,
    geometry,
    cellPositions,
    rowDirections,
    columnDirections,
    selectedGlyphs,
    cellPositionAttribute,
    rowDirectionAttribute,
    columnDirectionAttribute,
    selectedGlyphAttribute,
    gridNode,
    gridLayoutPitchNode,
    glyphScaleNode,
    horizontalProgressNode,
    verticalProgressNode,
    maskMaterial,
    revealMaterial,
    maskMesh,
    revealMesh,
    petalMesh,
    backgroundPetalGeometry,
    backgroundPetalCount,
    petalFlowPhases,
    petalFlowPhaseAttribute,
    petalTimeNode,
    keyLightDirectionNode,
    keyLightColorNode,
    transitionOpacityNode,
    petalMaterial,
    backgroundPetalHorizontalExtent: BACKGROUND_PETAL_HORIZONTAL_EXTENT,
    drawnPetalCount,
  };
}
