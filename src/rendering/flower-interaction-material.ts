// @ts-nocheck -- TSL graph nodes are runtime-validated behind the typed export.
import * as THREE from 'three/webgpu';
import { FLOWER_CONTACT_PALETTE } from '../presentation/flower-contact-palette';
import {
  attribute,
  faceDirection,
  float,
  instanceIndex,
  mix,
  normalFlat,
  screenUV,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import {
  PETAL_GEOMETRY,
  type ValueNode,
} from '../geometry/geometry-contract';
import {
  FLOWER_INTRO,
  FLOWER_INTRO_DURATION_SECONDS,
} from '../presentation/flower-intro-contract';
import {
  createFlowerIntroVertexPointLayer,
} from './flower-intro-vertex-points';
import {
  createFlowerIntroWireframeLayer,
} from './flower-intro-wireframe';
import {
  flowerIntroScreenSpaceMetrics,
} from './flower-intro-screen-space';

type FlowerInteractionMaterialInputs = {
  positionNode: any;
  curvinessDeltaNode: any;
  introStartCurvinessDeltaNode: any;
  realColorNode: any;
  realNormalNode: any;
  realRoughnessNode: any;
  realEmissiveNode: any;
  realAoNode: any;
  realMaskNode: any;
};

export type FlowerInteractionMaterial = {
  digitalMaterial: THREE.MeshStandardNodeMaterial;
  realMaterial: THREE.MeshStandardNodeMaterial;
  interactionMaterial: THREE.MeshStandardNodeMaterial;
  setElapsedSeconds(elapsedSeconds: number): void;
  setRealEmissiveNode(node: any): void;
  setScreenSpaceMetrics(
    cssWidth: number,
    cssHeight: number,
    renderWidth: number,
    renderHeight: number,
  ): void;
  setInteractionOverlay(
    fieldTexture: THREE.Texture,
    active: boolean,
    elapsedSeconds: number,
  ): void;
  setStageThreeProgress(progress: number): void;
  setContactProgress(progress: number): void;
  dispose(): void;
  uniforms: {
    elapsedSeconds: ValueNode<number>;
    screenSpaceScale: ValueNode<number>;
    interactionMode: ValueNode<number>;
    stageThreeProgress: ValueNode<number>;
    contactProgress: ValueNode<number>;
  };
};

export function createFlowerInteractionMaterial({
  positionNode,
  curvinessDeltaNode,
  introStartCurvinessDeltaNode,
  realColorNode,
  realNormalNode,
  realRoughnessNode,
  realEmissiveNode,
  realAoNode,
  realMaskNode,
}: FlowerInteractionMaterialInputs): FlowerInteractionMaterial {
  const elapsedSecondsNode: any = (uniform as any)(0);
  const screenSpaceScaleNode: any = (uniform as any)(1);
  const interactionModeNode: any = (uniform as any)(0);
  const stageThreeProgressNode: any = (uniform as any)(0);
  const contactProgressNode: any = (uniform as any)(0);
  const emptyInteractionFieldTexture = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 0]),
    1,
    1,
  );
  emptyInteractionFieldTexture.name =
    'FlowerIntro.emptyInteractionField';
  emptyInteractionFieldTexture.needsUpdate = true;
  const interactionFieldTextureNode: any = (texture as any)(
    emptyInteractionFieldTexture,
  );
  const outnessNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.outness,
    'float',
  );
  const petalIndexAttributeNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.petalIndex,
    'float',
  );
  const instanceBasisYNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.basisY,
    'vec3',
  );
  const shapeGridNode: any = attribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
    'vec3',
  );
  const gridNode = shapeGridNode.yz;
  const uvNode: any = attribute('uv', 'vec2');
  const rootToTipNode = uvNode.y;
  const cellNode = gridNode.floor();
  const cellLocalNode = gridNode.fract();
  const triangleHalfNode = cellLocalNode.y
    .greaterThan(cellLocalNode.x)
    .select(1, 0);
  const facetPhaseNode = (float as any)(instanceIndex)
    .add(1)
    .mul(91.731)
    .add(cellNode.x.mul(37.719))
    .add(cellNode.y.mul(17.371))
    .add(triangleHalfNode.mul(53.117));
  const facetSeedNode = (sin as any)(facetPhaseNode)
    .mul(43758.5453)
    .fract();
  const facetOpacitySeedNode = (sin as any)(
    (float as any)(instanceIndex)
      .add(1)
      .mul(47.193)
      .add(cellNode.x.mul(71.317))
      .add(cellNode.y.mul(29.917))
      .add(triangleHalfNode.mul(97.133)),
  )
    .mul(43758.5453)
    .fract();
  const petalIdentityNode = (float as any)(instanceIndex).add(1);
  const broadSweepWaveNode = (sin as any)(
    uvNode.x
      .mul(12.7)
      .add(rootToTipNode.mul(7.1))
      .add(outnessNode.mul(4.3))
      .add(petalIdentityNode.mul(0.37)),
  )
    .mul(0.5)
    .add(0.5);
  const detailSweepWaveNode = (sin as any)(
    uvNode.x
      .mul(25.1)
      .sub(rootToTipNode.mul(10.3))
      .add(outnessNode.mul(8.7))
      .add(petalIdentityNode.mul(0.19)),
  )
    .mul(0.5)
    .add(0.5);
  const coherentSweepAdvanceNode = broadSweepWaveNode
    .mul(0.68)
    .add(detailSweepWaveNode.mul(0.32))
    .mul(FLOWER_INTRO.coherentSweepAdvanceSeconds);
  const facetSweepAdvanceNode = facetSeedNode.mul(
    FLOWER_INTRO.facetSweepAdvanceSeconds,
  );
  const petalStartNode = (float as any)(FLOWER_INTRO.emptyLeadSeconds).add(
    outnessNode
      .oneMinus()
      .clamp(0, 1)
      .pow(FLOWER_INTRO.orderExponent)
      .mul(FLOWER_INTRO.petalOrderSpanSeconds),
  );
  const sweepAgeNode = elapsedSecondsNode
    .sub(petalStartNode)
    .sub(rootToTipNode.mul(FLOWER_INTRO.rootToTipSweepSeconds))
    .add(coherentSweepAdvanceNode)
    .add(facetSweepAdvanceNode);
  const petalAgeNode = elapsedSecondsNode.sub(petalStartNode);
  const curvinessFactorNode = (smoothstep as any)(
    0,
    FLOWER_INTRO.curvinessBlendSeconds,
    petalAgeNode,
  );
  const revealNode = (smoothstep as any)(
    -FLOWER_INTRO.revealBandSeconds,
    FLOWER_INTRO.revealBandSeconds,
    sweepAgeNode,
  );
  const realNode = (smoothstep as any)(
    FLOWER_INTRO.realCatchupDelaySeconds,
    FLOWER_INTRO.realCatchupDelaySeconds +
      FLOWER_INTRO.realCatchupBandSeconds,
    sweepAgeNode,
  );
  const digitalEnergyNode = revealNode.mul(
    realNode.pow(FLOWER_INTRO.digitalEnergyExponent).oneMinus(),
  );
  const interactionFieldEnergyNode = interactionFieldTextureNode
    .sample(screenUV)
    .z
    .clamp(0, 1);
  const interactionBoundaryVariationNode = broadSweepWaveNode
    .mul(0.62)
    .add(detailSweepWaveNode.mul(0.18))
    .add(facetSeedNode.mul(0.2))
    .sub(0.5);
  const interactionBoundaryInfluenceNode =
    interactionFieldEnergyNode
      .mul(interactionFieldEnergyNode.oneMinus())
      .mul(4)
      .clamp(0, 1);
  const interactionEnergyNode = interactionFieldEnergyNode
    .add(
      interactionBoundaryVariationNode
        .mul(0.567)
        .mul(interactionBoundaryInfluenceNode),
    )
    .clamp(0, 1);
  const stageThreeEnergyNode = stageThreeProgressNode.clamp(0, 1);
  const interactionBlendNode = interactionEnergyNode
    .pow(0.82)
    .max(stageThreeEnergyNode);
  const presentationDigitalEnergyNode = (mix as any)(
    digitalEnergyNode,
    interactionEnergyNode.max(stageThreeEnergyNode),
    interactionModeNode,
  );
  const presentationRevealNode = (mix as any)(
    revealNode,
    interactionEnergyNode.max(stageThreeEnergyNode),
    interactionModeNode,
  );
  const vertexPointLayer = createFlowerIntroVertexPointLayer({
    gridNode,
    instanceIndexNode: (float as any)(instanceIndex),
    elapsedSecondsNode,
    revealNode: presentationRevealNode,
    digitalEnergyNode: presentationDigitalEnergyNode,
    screenSpaceScaleNode,
  });
  const wireframeLayer = createFlowerIntroWireframeLayer({
    gridNode,
    instanceIndexNode: (float as any)(instanceIndex),
    elapsedSecondsNode,
    digitalEnergyNode: presentationDigitalEnergyNode,
    screenSpaceScaleNode,
  });
  const flickerRateNode = facetSeedNode.mul(7).add(7.5);
  const flickerNode = (sin as any)(
    elapsedSecondsNode
      .mul(flickerRateNode)
      .add(facetSeedNode.mul(Math.PI * 2)),
  )
    .mul(0.5)
    .add(0.5);
  const facetPulseNode = flickerNode
    .pow(6)
    .mul(0.24)
    .add(facetSeedNode.mul(0.16))
    .add(0.58);
  const hotFacetNode = (smoothstep as any)(0.78, 0.96, facetSeedNode)
    .mul(flickerNode.pow(4));
  const constructionFrontNode = sweepAgeNode
    .abs()
    .smoothstep(0, FLOWER_INTRO.revealBandSeconds * 1.65)
    .oneMinus()
    .mul(revealNode)
    .mul(realNode.oneMinus());
  const presentationFrontNode = (mix as any)(
    constructionFrontNode,
    (float as any)(0),
    interactionModeNode,
  );
  const leadingEdgeStretchNode = sweepAgeNode
    .abs()
    .smoothstep(0, FLOWER_INTRO.revealBandSeconds * 2.6)
    .oneMinus()
    .mul(realNode.oneMinus());
  const curvinessPresentationPositionNode = positionNode.add(
    introStartCurvinessDeltaNode
      .sub(curvinessDeltaNode)
      .mul(curvinessFactorNode.oneMinus()),
  );
  const presentationPositionNode =
    curvinessPresentationPositionNode.add(
      instanceBasisYNode.mul(
        leadingEdgeStretchNode.mul(
          FLOWER_INTRO.leadingEdgeStretchPetalUnits,
        ),
      ),
    );
  const facetOpacityWaveNode = (sin as any)(
    elapsedSecondsNode
      .mul(facetOpacitySeedNode.mul(6).add(8))
      .add(facetOpacitySeedNode.mul(Math.PI * 2)),
  )
    .mul(0.5)
    .add(0.5);
  const settledFacetCoverageNode = facetOpacityWaveNode
    .mul(FLOWER_INTRO.settledFacetOpacityRange)
    .add(FLOWER_INTRO.settledFacetOpacityMin);
  const boundaryFacetCoverageNode = facetOpacityWaveNode
    .mul(FLOWER_INTRO.boundaryFacetOpacityRange)
    .add(FLOWER_INTRO.boundaryFacetOpacityMin);
  const facetCoverageNode = (mix as any)(
    settledFacetCoverageNode,
    boundaryFacetCoverageNode,
    presentationFrontNode,
  );
  const luminousFeatureCoverageNode = wireframeLayer.intensityNode
    .mul(0.78)
    .add(vertexPointLayer.intensityNode)
    .clamp(0, 1);
  const digitalCoverageNode = facetCoverageNode.max(
    luminousFeatureCoverageNode.mul(0.96),
  );
  const iceBlueNode = (vec3 as any)(0.04, 0.38, 1.0);
  const electricBlueNode = (vec3 as any)(0.004, 0.025, 0.3);
  const whiteNode = (vec3 as any)(1.0, 1.0, 1.0);
  const facetColorNode = (mix as any)(
    electricBlueNode,
    iceBlueNode,
    facetSeedNode.mul(0.72).add(0.18),
  )
    .mul(facetPulseNode)
    .add(iceBlueNode.mul(hotFacetNode.mul(0.48)))
    .add(whiteNode.mul(presentationFrontNode.mul(0.26)));
  const grainCoordinateNode = uvNode.mul(
    (vec2 as any)(72, 84),
  );
  const grainCellNode = grainCoordinateNode.floor();
  const grainLocalNode = grainCoordinateNode
    .fract()
    .sub(0.5);
  const grainSeedNode = (sin as any)(
    grainCellNode.x
      .mul(41.713)
      .add(grainCellNode.y.mul(89.221))
      .add(petalIdentityNode.mul(67.419))
      .add(facetSeedNode.mul(13.117)),
  )
    .mul(43758.5453)
    .fract();
  const grainFootprintNode = grainCoordinateNode.x
    .fwidth()
    .max(grainCoordinateNode.y.fwidth())
    .max(0.0001);
  const grainRadiusNode = grainSeedNode
    .mul(0.055)
    .add(0.105)
    .mul(screenSpaceScaleNode);
  const grainDiscNode = grainLocalNode
    .dot(grainLocalNode)
    .sqrt()
    .smoothstep(
      grainRadiusNode.sub(grainFootprintNode.mul(0.62)),
      grainRadiusNode.add(grainFootprintNode.mul(0.62)),
    )
    .oneMinus()
    .mul(
      grainRadiusNode
        .div(grainFootprintNode)
        .clamp(0, 1),
    );
  const grainDensityNode = (smoothstep as any)(
    0.86,
    0.96,
    grainSeedNode,
  );
  const grainShimmerNode = (sin as any)(
    elapsedSecondsNode
      .mul(grainSeedNode.mul(3.2).add(5.4))
      .add(grainSeedNode.mul(Math.PI * 2)),
  )
    .mul(0.5)
    .add(0.5)
    .mul(0.58)
    .add(0.42);
  const leadingEdgeGrainNode = grainDiscNode
    .mul(grainDensityNode)
    .mul(grainShimmerNode)
    .mul(presentationFrontNode);
  const grainColorNode = (mix as any)(
    iceBlueNode,
    whiteNode,
    grainSeedNode.mul(0.5).add(0.42),
  );
  const digitalColorNode = facetColorNode
    .add(
      wireframeLayer.colorNode.mul(
        wireframeLayer.intensityNode.mul(0.72),
      ),
    )
    .add(
      vertexPointLayer.colorNode.mul(
        vertexPointLayer.intensityNode.mul(0.55),
      ),
    )
    .clamp(0, 1.4);
  const interactionGlassCoverageNode = facetOpacitySeedNode
    .mul(0.34)
    .add(0.28);
  const interactionTransmissionTintNode = (mix as any)(
    realColorNode,
    iceBlueNode,
    facetOpacitySeedNode.mul(0.18).add(0.12),
  ).mul(facetOpacitySeedNode.mul(0.1).add(0.76));
  const interactionSciFiColorNode = (mix as any)(
    interactionTransmissionTintNode,
    digitalColorNode,
    interactionGlassCoverageNode,
  );
  const orangeHueDirectionNode = (vec3 as any)(
    ...FLOWER_CONTACT_PALETTE.materialOrangeDirection,
  );
  const warningHueDirectionNode = (vec3 as any)(
    ...FLOWER_CONTACT_PALETTE.materialWarningDirection,
  );
  const blueToOrangeNode = contactProgressNode
    .sub(FLOWER_CONTACT_PALETTE.blueEnd)
    .div(
      FLOWER_CONTACT_PALETTE.orangeEnd -
        FLOWER_CONTACT_PALETTE.blueEnd,
    )
    .clamp(0, 1);
  const orangeToWarningNode = contactProgressNode
    .sub(FLOWER_CONTACT_PALETTE.orangeEnd)
    .div(1 - FLOWER_CONTACT_PALETTE.orangeEnd)
    .clamp(0, 1);
  const stageTwoNativeBlueNode = contactProgressNode.lessThanEqual(
    FLOWER_CONTACT_PALETTE.blueEnd,
  );
  const shiftHuePreservingNativePeak = (
    nativeNode: any,
    targetDirectionNode: any,
    amountNode: any,
  ) => {
    const nativePeakNode = nativeNode.x
      .max(nativeNode.y)
      .max(nativeNode.z);
    const safeNativePeakNode = nativePeakNode.max(0.0001);
    const nativeDirectionNode = nativeNode.div(safeNativePeakNode);
    const shiftedDirectionNode = (mix as any)(
      nativeDirectionNode,
      targetDirectionNode,
      amountNode,
    );
    const shiftedPeakNode = shiftedDirectionNode.x
      .max(shiftedDirectionNode.y)
      .max(shiftedDirectionNode.z)
      .max(0.0001);
    return shiftedDirectionNode
      .div(shiftedPeakNode)
      .mul(nativePeakNode);
  };
  const orangeStageTwoSciFiColorNode = shiftHuePreservingNativePeak(
    interactionSciFiColorNode,
    orangeHueDirectionNode,
    blueToOrangeNode,
  );
  const shiftedStageTwoSciFiColorNode = shiftHuePreservingNativePeak(
    orangeStageTwoSciFiColorNode,
    warningHueDirectionNode,
    orangeToWarningNode,
  );
  const stageTwoSciFiColorNode = stageTwoNativeBlueNode.select(
    interactionSciFiColorNode,
    shiftedStageTwoSciFiColorNode,
  );
  const stageThreeBlueSciFiColorNode = (mix as any)(
    interactionSciFiColorNode,
    iceBlueNode,
    0.9,
  );
  const warningColorNode = (vec3 as any)(
    ...FLOWER_CONTACT_PALETTE.materialWarningColor,
  );
  const stageThreeWarningTrailLength = 1.35;
  const stageThreeWarningSettleLength = 0.32;
  const stageThreeWarningCycleDurationSeconds = 2.7;
  const stageThreeWarningCycleLength =
    1 + stageThreeWarningTrailLength + stageThreeWarningSettleLength;
  const stageThreeWarningPhaseNode = (sin as any)(
    petalIndexAttributeNode.add(1).mul(12.9898),
  )
    .mul(43758.5453)
    .fract();
  const stageThreeWarningFrontNode = elapsedSecondsNode
    .div(stageThreeWarningCycleDurationSeconds)
    .add(stageThreeWarningPhaseNode)
    .fract()
    .mul(stageThreeWarningCycleLength);
  const stageThreeWarningBehindFrontNode = stageThreeWarningFrontNode.sub(
    rootToTipNode,
  );
  const stageThreeWarningHeadNode = rootToTipNode
    .lessThan(stageThreeWarningFrontNode)
    .select(1, 0);
  const stageThreeWarningTrailNode = (smoothstep as any)(
    0,
    stageThreeWarningTrailLength,
    stageThreeWarningBehindFrontNode,
  ).oneMinus();
  const stageThreeWarningWaveNode = stageThreeWarningHeadNode
    .mul(stageThreeWarningTrailNode)
    .mul(stageThreeEnergyNode);
  const stageThreeWarningLeadingEdgeNode = stageThreeWarningHeadNode
    .mul(
      (smoothstep as any)(
        0,
        0.055,
        stageThreeWarningBehindFrontNode,
      ).oneMinus(),
    )
    .mul(stageThreeEnergyNode);
  const stageThreeSciFiColorNode = (mix as any)(
    stageThreeBlueSciFiColorNode,
    warningColorNode,
    stageThreeWarningWaveNode.mul(0.82),
  );
  const activeInteractionSciFiColorNode = (mix as any)(
    stageTwoSciFiColorNode,
    stageThreeSciFiColorNode,
    stageThreeEnergyNode,
  );
  const flatViewNormalNode: any = (normalFlat as any)
    .mul(faceDirection)
    .normalize();
  const digitalEmissiveNode = facetColorNode
    .mul(presentationDigitalEnergyNode.mul(0.15))
    .add(
      wireframeLayer.colorNode.mul(
        wireframeLayer.intensityNode.mul(1.45),
      ),
    )
    .add(iceBlueNode.mul(presentationFrontNode.mul(0.82)))
    .add(
      whiteNode.mul(
        hotFacetNode
          .mul(presentationDigitalEnergyNode)
          .mul(0.42),
      ),
    )
    .add(
      vertexPointLayer.colorNode.mul(
        vertexPointLayer.intensityNode.mul(2.4),
      ),
    )
    .add(
      grainColorNode.mul(leadingEdgeGrainNode.mul(0.72)),
    );
  const nativeInteractionSciFiEmissiveNode =
    digitalEmissiveNode.add(iceBlueNode.mul(0.08));
  const orangeStageTwoSciFiEmissiveNode = shiftHuePreservingNativePeak(
    nativeInteractionSciFiEmissiveNode,
    orangeHueDirectionNode,
    blueToOrangeNode,
  );
  const shiftedStageTwoSciFiEmissiveNode = shiftHuePreservingNativePeak(
    orangeStageTwoSciFiEmissiveNode,
    warningHueDirectionNode,
    orangeToWarningNode,
  );
  const stageTwoSciFiEmissiveNode = stageTwoNativeBlueNode.select(
    nativeInteractionSciFiEmissiveNode,
    shiftedStageTwoSciFiEmissiveNode,
  );
  const stageThreeSciFiEmissiveNode = nativeInteractionSciFiEmissiveNode.add(
    warningColorNode.mul(
      stageThreeWarningWaveNode
        .mul(0.72)
        .add(stageThreeWarningLeadingEdgeNode.mul(0.46)),
    ),
  );
  const interactionSciFiEmissiveNode = (mix as any)(
    stageTwoSciFiEmissiveNode,
    stageThreeSciFiEmissiveNode,
    stageThreeEnergyNode,
  );
  let currentRealEmissiveNode = realEmissiveNode;

  const digitalMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0x5aaeff,
    roughness: 0.08,
    metalness: 0.72,
    side: THREE.DoubleSide,
  });
  const introStartedNode = elapsedSecondsNode.greaterThanEqual(
    FLOWER_INTRO.emptyLeadSeconds,
  );
  digitalMaterial.positionNode = presentationPositionNode;
  digitalMaterial.colorNode = digitalColorNode;
  digitalMaterial.normalNode = flatViewNormalNode;
  digitalMaterial.roughnessNode = (float as any)(0.08);
  digitalMaterial.metalnessNode = (float as any)(0.72);
  digitalMaterial.aoNode = (float as any)(1);
  digitalMaterial.opacityNode = digitalEnergyNode.mul(
    digitalCoverageNode,
  );
  digitalMaterial.transparent = true;
  digitalMaterial.premultipliedAlpha = true;
  digitalMaterial.depthTest = true;
  digitalMaterial.depthWrite = false;
  digitalMaterial.forceSinglePass = true;
  digitalMaterial.maskNode = introStartedNode;
  digitalMaterial.maskShadowNode = (float as any)(0);
  digitalMaterial.emissiveNode = digitalEmissiveNode;

  const realFacetThresholdNode = facetOpacitySeedNode
    .mul(0.62)
    .add(0.19);
  const realVisibleNode = realNode.greaterThanEqual(
    realFacetThresholdNode,
  );
  const realPresentationMaskNode = realMaskNode
    .and(introStartedNode)
    .and(curvinessFactorNode.greaterThanEqual(1))
    .and(realVisibleNode);
  const realMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0xc7a9b8,
    roughness: 0.3,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  realMaterial.positionNode = presentationPositionNode;
  realMaterial.colorNode = realColorNode;
  realMaterial.normalNode = realNormalNode;
  realMaterial.roughnessNode = realRoughnessNode;
  realMaterial.metalnessNode = (float as any)(0);
  realMaterial.aoNode = realAoNode;
  realMaterial.maskNode = realPresentationMaskNode;
  realMaterial.maskShadowNode = realPresentationMaskNode;
  realMaterial.emissiveNode = currentRealEmissiveNode;

  const interactionMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0x5aaeff,
    roughness: 0.08,
    metalness: 0.72,
    side: THREE.DoubleSide,
  });
  interactionMaterial.positionNode = positionNode;
  interactionMaterial.colorNode = (mix as any)(
    realColorNode,
    activeInteractionSciFiColorNode,
    interactionBlendNode,
  );
  interactionMaterial.normalNode = (mix as any)(
    realNormalNode,
    flatViewNormalNode,
    interactionBlendNode,
  ).normalize();
  interactionMaterial.roughnessNode = (mix as any)(
    realRoughnessNode,
    (float as any)(0.08),
    interactionBlendNode,
  );
  interactionMaterial.metalnessNode =
    interactionBlendNode.mul(0.72);
  interactionMaterial.aoNode = (mix as any)(
    realAoNode,
    (float as any)(1),
    interactionBlendNode,
  );
  interactionMaterial.opacityNode = (float as any)(1);
  interactionMaterial.maskNode = realMaskNode;
  interactionMaterial.maskShadowNode = realMaskNode;
  interactionMaterial.depthTest = true;
  interactionMaterial.depthWrite = true;
  interactionMaterial.forceSinglePass = true;
  interactionMaterial.emissiveNode = currentRealEmissiveNode;

  function updateRealEmissiveNode() {
    realMaterial.emissiveNode = currentRealEmissiveNode;
    realMaterial.needsUpdate = true;
    interactionMaterial.emissiveNode = (mix as any)(
      currentRealEmissiveNode,
      interactionSciFiEmissiveNode,
      interactionBlendNode,
    );
    interactionMaterial.needsUpdate = true;
  }

  updateRealEmissiveNode();

  function setElapsedSeconds(elapsedSeconds: number) {
    elapsedSecondsNode.value = Math.min(
      FLOWER_INTRO_DURATION_SECONDS,
      Math.max(0, elapsedSeconds),
    );
  }

  function setRealEmissiveNode(node: any) {
    currentRealEmissiveNode = node;
    updateRealEmissiveNode();
  }

  function setScreenSpaceMetrics(
    cssWidth: number,
    cssHeight: number,
    renderWidth: number,
    renderHeight: number,
  ) {
    const metrics = flowerIntroScreenSpaceMetrics(
      cssWidth,
      cssHeight,
      renderWidth,
      renderHeight,
    );
    screenSpaceScaleNode.value = metrics.shaderPixelScale;
  }

  function setInteractionOverlay(
    fieldTexture: THREE.Texture,
    active: boolean,
    elapsedSeconds: number,
  ) {
    interactionFieldTextureNode.value = fieldTexture;
    interactionModeNode.value = active ? 1 : 0;
    if (active) elapsedSecondsNode.value = elapsedSeconds;
  }

  function setStageThreeProgress(progress: number) {
    stageThreeProgressNode.value = Math.min(1, Math.max(0, progress));
  }

  function setContactProgress(progress: number) {
    contactProgressNode.value = Math.min(1, Math.max(0, progress));
  }

  function dispose() {
    emptyInteractionFieldTexture.dispose();
  }

  return {
    digitalMaterial,
    realMaterial,
    interactionMaterial,
    setElapsedSeconds,
    setRealEmissiveNode,
    setScreenSpaceMetrics,
    setInteractionOverlay,
    setStageThreeProgress,
    setContactProgress,
    dispose,
    uniforms: {
      elapsedSeconds: elapsedSecondsNode,
      screenSpaceScale: screenSpaceScaleNode,
      interactionMode: interactionModeNode,
      stageThreeProgress: stageThreeProgressNode,
      contactProgress: contactProgressNode,
    },
  };
}
