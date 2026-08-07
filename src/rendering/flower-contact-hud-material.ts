// @ts-nocheck -- TSL graph nodes are runtime-validated by the WebGPU build.
import * as THREE from 'three/webgpu';
import {
  atan,
  mix,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import {
  FLOWER_CONTACT_HUD_PALETTE,
} from '../presentation/flower-contact-palette';
import {
  flowerContactHudStableHash,
  FLOWER_CONTACT_HUD,
} from './flower-contact-hud-contract';

function ring(distanceNode: any, radius: number, width: number) {
  const edge = distanceNode.fwidth().max(0.0015);
  return distanceNode
    .sub(radius)
    .abs()
    .smoothstep(width, edge.add(width))
    .oneMinus();
}

function segmented(angleNode: any, count: number, duty: number) {
  return angleNode
    .mul(count)
    .fract()
    .smoothstep(duty, duty + 0.045)
    .oneMinus();
}

function angularMark(angleNode: any, count: number, width: number) {
  return angleNode
    .mul(count)
    .fract()
    .sub(0.5)
    .abs()
    .smoothstep(width, width + 0.018)
    .oneMinus();
}

function radialBand(
  distanceNode: any,
  innerRadius: number,
  outerRadius: number,
) {
  const edge = distanceNode.fwidth().max(0.0015);
  return (smoothstep as any)(
    innerRadius,
    edge.add(innerRadius),
    distanceNode,
  ).mul(
    (smoothstep as any)(
      outerRadius,
      edge.add(outerRadius),
      distanceNode,
    ).oneMinus(),
  );
}

function axisBand(valueNode: any, center: number, halfExtent: number) {
  const distance = valueNode.sub(center).abs();
  const edge = distance.fwidth().max(0.0015);
  return distance
    .smoothstep(halfExtent, edge.add(halfExtent))
    .oneMinus();
}

function rectangle(
  coordinateNode: any,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
) {
  return axisBand(coordinateNode.x, centerX, halfWidth)
    .mul(axisBand(coordinateNode.y, centerY, halfHeight));
}

function stableHash(valueNode: any, seed: number) {
  return valueNode
    .add(seed)
    .mul(12.9898)
    .sin()
    .mul(43758.5453)
    .fract();
}

function hudProgressColor(
  progressNode: any,
  coolColor: any,
  orangeColor: any,
  dangerColor: any,
) {
  const palette = FLOWER_CONTACT_HUD_PALETTE;
  const warmBlend = (smoothstep as any)(
    palette.warmStart,
    palette.orangeAt,
    progressNode,
  );
  const dangerBlend = (smoothstep as any)(
    palette.dangerStart,
    palette.dangerAt,
    progressNode,
  );
  return (mix as any)(
    (mix as any)(coolColor, orangeColor, warmBlend),
    dangerColor,
    dangerBlend,
  );
}

function revealGroup(
  timeNode: any,
  startSeconds: number,
  durationSeconds: number,
  flickerSeed?: number,
) {
  const settledAt = startSeconds + durationSeconds;
  const fade = (smoothstep as any)(
    startSeconds,
    settledAt,
    timeNode,
  );
  if (flickerSeed === undefined) return fade;
  const entering = (smoothstep as any)(
    startSeconds,
    startSeconds + 0.025,
    timeNode,
  ).mul(
    (smoothstep as any)(
      settledAt - 0.055,
      settledAt,
      timeNode,
    ).oneMinus(),
  );
  const interruption = stableHash(
    timeNode.mul(13).floor(),
    flickerSeed,
  ).greaterThan(0.24).select(1, 0.18);
  return fade.mul((mix as any)(1, interruption, entering));
}

function revealRadius(
  distanceNode: any,
  timeNode: any,
  startSeconds: number,
  durationSeconds: number,
  startScale: number,
) {
  const entryRadiusDurationSeconds = durationSeconds * 0.5;
  const radialEase = (smoothstep as any)(
    startSeconds,
    startSeconds + entryRadiusDurationSeconds,
    timeNode,
  );
  return distanceNode.div((mix as any)(startScale, 1, radialEase));
}

function ringRadiusOffsetNode(
  progressNode: any,
  elapsedSecondsNode: any,
  ringIndex: number,
) {
  const hud = FLOWER_CONTACT_HUD;
  const instability = (smoothstep as any)(
    hud.ringRadiusInstabilityStart,
    hud.ringRadiusInstabilityMaximumAt,
    progressNode,
  );
  const frequencyA = 29 + flowerContactHudStableHash(ringIndex, 22.4) * 19;
  const frequencyB = 51 + flowerContactHudStableHash(ringIndex, 74.8) * 23;
  const phaseA = flowerContactHudStableHash(ringIndex, 39.7) * Math.PI * 2;
  const phaseB = flowerContactHudStableHash(ringIndex, 96.3) * Math.PI * 2;
  return elapsedSecondsNode
    .mul(frequencyA)
    .add(phaseA)
    .sin()
    .mul(0.64)
    .add(
      elapsedSecondsNode
        .mul(frequencyB)
        .add(phaseB)
        .sin()
        .mul(0.36),
    )
    .mul(hud.ringRadiusVariationMaximum)
    .mul(instability);
}

export function createFlowerContactHudMaterial() {
  const progressNode: any = (uniform as any)(0);
  const opacityNode: any = (uniform as any)(0);
  const elapsedSecondsNode: any = (uniform as any)(0);
  const revealSecondsNode: any = (uniform as any)(0);
  const departureRadiusNodes = Array.from(
    { length: FLOWER_CONTACT_HUD.ringElementFamilyCount },
    () => (uniform as any)(0),
  );
  const departureLaunchRadiusNodes = Array.from(
    { length: FLOWER_CONTACT_HUD.ringElementFamilyCount },
    () => (uniform as any)(0),
  );
  const departureVibrationWeightNodes = Array.from(
    { length: FLOWER_CONTACT_HUD.ringElementFamilyCount },
    () => (uniform as any)(1),
  );
  const departureActiveNode: any = (uniform as any)(0);
  const departureCarrierOverscanNode: any = (uniform as any)(1);
  const hud = FLOWER_CONTACT_HUD;
  const coordinate = (uv as any)()
    .sub(0.5)
    .mul(2)
    .mul(departureCarrierOverscanNode);
  const radius = coordinate.length();
  const rawAngle = (atan as any)(coordinate.y, coordinate.x)
    .div(Math.PI * 2)
    .add(1)
    .fract();
  const clockwiseFromTop = rawAngle
    .sub(0.25)
    .negate()
    .add(1)
    .fract();
  const progressMask = clockwiseFromTop
    .lessThanEqual(progressNode)
    .select(1, 0);

  const progressReveal = revealGroup(revealSecondsNode, 0, 0.08, 5.3);
  const trackReveal = revealGroup(revealSecondsNode, 0.025, 0.16, 8.7);
  const majorReveal = revealGroup(revealSecondsNode, 0.055, 0.27, 17.9);
  const structureReveal = revealGroup(revealSecondsNode, 0.13, 0.34, 11.7);
  const nodeReveal = revealGroup(revealSecondsNode, 0.22, 0.3, 31.4);
  const telemetryReveal = revealGroup(revealSecondsNode, 0.28, 0.39, 46.8);
  const microReveal = revealGroup(revealSecondsNode, 0.34, 0.44, 58.2);
  const scanReveal = revealGroup(revealSecondsNode, 0.41, 0.3, 83.6);
  const secondaryReveal = revealGroup(revealSecondsNode, 0.5, 0.43, 104.9);
  const familyOffsets = Array.from(
    { length: FLOWER_CONTACT_HUD.ringElementFamilyCount },
    (_, ringIndex) => ringRadiusOffsetNode(
      progressNode,
      elapsedSecondsNode,
      ringIndex,
    ),
  );
  const familyRadius = (
    ringIndex: number,
    startSeconds: number,
    durationSeconds: number,
    startScale: number,
  ) => revealRadius(
    radius,
    revealSecondsNode,
    startSeconds,
    durationSeconds,
    startScale,
  )
    .sub((mix as any)(
      familyOffsets[ringIndex],
      departureLaunchRadiusNodes[ringIndex].mul(
        departureVibrationWeightNodes[ringIndex],
      ),
      departureActiveNode,
    ))
    .sub(departureRadiusNodes[ringIndex]);
  const outerHaloRadius = familyRadius(0, 0.055, 0.27, 1.12);
  const outerMicroRadius = familyRadius(1, 0.34, 0.44, 0.84);
  const outerMajorTickRadius = familyRadius(2, 0.5, 0.43, 0.8);
  const outerTechnicalRailRadius = familyRadius(3, 0.13, 0.34, 0.87);
  const outerJunctionRadius = familyRadius(4, 0.22, 0.3, 1.1);
  const progressTrackRadius = familyRadius(5, 0.025, 0.16, 1.1);
  const progressRadius = familyRadius(6, 0, 0.08, 0.82);
  const locatorNodeRadius = familyRadius(7, 0.22, 0.3, 1.1);
  const locatorStructureRadius = familyRadius(8, 0.13, 0.34, 0.87);
  const connectorNodeRadius = familyRadius(9, 0.22, 0.3, 1.1);
  const telemetryRadius = familyRadius(10, 0.28, 0.39, 1.14);
  const innerStatusRadius = familyRadius(11, 0.13, 0.34, 0.87);
  const innerMicroRadius = familyRadius(12, 0.34, 0.44, 0.84);
  const tertiaryOffset = familyOffsets[13];
  const tertiaryTickRadius = revealRadius(
    radius, revealSecondsNode, 0.5, 0.43, 0.8,
  )
    .sub((mix as any)(
      tertiaryOffset,
      departureLaunchRadiusNodes[13].mul(
        departureVibrationWeightNodes[13],
      ),
      departureActiveNode,
    ))
    .sub(departureRadiusNodes[13]);
  const tertiaryBlockRadius = revealRadius(
    radius, revealSecondsNode, 0.13, 0.34, 0.87,
  )
    .sub((mix as any)(
      tertiaryOffset,
      departureLaunchRadiusNodes[13].mul(
        departureVibrationWeightNodes[13],
      ),
      departureActiveNode,
    ))
    .sub(departureRadiusNodes[13]);
  const tertiaryNodeRadius = revealRadius(
    radius, revealSecondsNode, 0.22, 0.3, 1.1,
  )
    .sub((mix as any)(
      tertiaryOffset,
      departureLaunchRadiusNodes[13].mul(
        departureVibrationWeightNodes[13],
      ),
      departureActiveNode,
    ))
    .sub(departureRadiusNodes[13]);
  const innerRailRadius = familyRadius(14, 0.5, 0.43, 0.8);
  const scanRadius = familyRadius(15, 0.41, 0.3, 1.07);

  const outerTickAngle = clockwiseFromTop
    .add(elapsedSecondsNode.mul(0.0045))
    .fract();
  const counterRailAngle = clockwiseFromTop
    .sub(elapsedSecondsNode.mul(0.0075))
    .add(1)
    .fract();
  const nodeAngle = clockwiseFromTop
    .add(elapsedSecondsNode.mul(0.0058))
    .fract();
  const innerAngle = clockwiseFromTop
    .sub(elapsedSecondsNode.mul(0.009))
    .add(1)
    .fract();
  const counterTelemetryAngle = clockwiseFromTop
    .negate()
    .add(1)
    .add(elapsedSecondsNode.mul(0.0065))
    .fract();
  const counterTelemetryMask = counterTelemetryAngle
    .lessThanEqual(progressNode)
    .select(1, 0);
  const tertiaryProgressAngle = innerAngle
    .add(elapsedSecondsNode.mul(0.0035))
    .fract();
  const tertiaryProgressMask = tertiaryProgressAngle
    .lessThanEqual(progressNode)
    .select(1, 0);

  const outerTickIndex = outerTickAngle.mul(96).floor();
  const outerTickVariation = stableHash(outerTickIndex, 3.7)
    .mul(0.38)
    .add(0.62);
  const flickerMembership = stableHash(outerTickIndex, 19.4)
    .greaterThan(0.82)
    .select(1, 0);
  const flickerSlice = elapsedSecondsNode.mul(2.4).floor();
  const irregularFlicker = stableHash(
    outerTickIndex.add(flickerSlice.mul(113)),
    41.2,
  ).mul(0.12).add(0.88);
  const outerTickActivity = (mix as any)(
    1,
    irregularFlicker,
    flickerMembership,
  );

  const progressIndex = clockwiseFromTop
    .mul(FLOWER_CONTACT_HUD.progressSegments)
    .floor();
  const progressVariation = stableHash(progressIndex, 8.1)
    .mul(0.24)
    .add(0.76);
  const pulseMembership = stableHash(progressIndex, 28.3)
    .greaterThan(0.56)
    .select(1, 0);
  const staggeredPulse = elapsedSecondsNode
    .mul(0.72)
    .add(stableHash(progressIndex, 14.6).mul(Math.PI * 2))
    .sin()
    .mul(0.5)
    .add(0.5)
    .mul(0.1)
    .add(0.9);
  const progressActivity = (mix as any)(
    1,
    staggeredPulse,
    pulseMembership,
  );
  const progressInstability = (smoothstep as any)(0.6, 1, progressNode);
  const segmentThicknessFrequencyA = stableHash(progressIndex, 63.1)
    .mul(24)
    .add(32);
  const segmentThicknessFrequencyB = stableHash(progressIndex, 91.7)
    .mul(31)
    .add(57);
  const segmentThicknessNoise = elapsedSecondsNode
    .mul(segmentThicknessFrequencyA)
    .add(stableHash(progressIndex, 14.6).mul(Math.PI * 2))
    .sin()
    .mul(0.68)
    .add(
      elapsedSecondsNode
        .mul(segmentThicknessFrequencyB)
        .add(stableHash(progressIndex, 48.2).mul(Math.PI * 2))
        .sin()
        .mul(0.32),
    );
  const progressHalfWidth = segmentThicknessNoise
    .mul(FLOWER_CONTACT_HUD.primaryRingHalfWidthVariation)
    .mul(progressInstability)
    .add(FLOWER_CONTACT_HUD.primaryRingHalfWidth)
    .clamp(
      FLOWER_CONTACT_HUD.primaryRingMinimumHalfWidth,
      FLOWER_CONTACT_HUD.primaryRingMaximumHalfWidth,
    );

  const outerHalo = ring(outerHaloRadius, 0.916, 0.0035).mul(0.17)
    .add(ring(outerHaloRadius, 0.902, 0.0018).mul(0.09))
    .mul(majorReveal);
  const outerMicroTicks = radialBand(outerMicroRadius, 0.868, 0.884)
    .mul(angularMark(outerTickAngle, 96, 0.1))
    .mul(outerTickVariation)
    .mul(outerTickActivity)
    .mul(microReveal)
    .mul(0.29);
  const outerMajorTicks = radialBand(outerMajorTickRadius, 0.844, 0.894)
    .mul(angularMark(counterRailAngle.add(0.5 / 24), 24, 0.052))
    .mul(
      stableHash(counterRailAngle.mul(24).floor(), 17.3)
        .mul(0.26)
        .add(0.74),
    )
    .mul(secondaryReveal)
    .mul(0.43);
  const outerTechnicalRail = ring(outerTechnicalRailRadius, 0.898, 0.0022)
    .mul(segmented(counterRailAngle.add(0.004), 16, 0.64))
    .mul(structureReveal)
    .mul(0.18);
  const outerJunctionNodes = ring(outerJunctionRadius, 0.894, 0.007)
    .mul(angularMark(counterRailAngle.add(0.5 / 24), 24, 0.055))
    .mul(nodeReveal)
    .mul(0.54);

  const progressTrack = ring(
    progressTrackRadius,
    FLOWER_CONTACT_HUD.primaryRingRadius,
    0.0045,
  )
    .mul(trackReveal)
    .mul(0.17);
  const progressRing = ring(
    progressRadius,
    FLOWER_CONTACT_HUD.primaryRingRadius,
    progressHalfWidth,
  )
    .mul(segmented(clockwiseFromTop, FLOWER_CONTACT_HUD.progressSegments, 0.88))
    .mul(progressVariation)
    .mul(progressActivity)
    .mul(progressMask)
    .mul(progressReveal)
    .mul(0.94);
  const progressMicroTicks = radialBand(progressRadius, 0.792, 0.807)
    .mul(angularMark(clockwiseFromTop, FLOWER_CONTACT_HUD.progressSegments, 0.09))
    .mul(progressMask)
    .mul(progressVariation)
    .mul(microReveal)
    .mul(0.38);
  const progressDelta = clockwiseFromTop
    .sub(progressNode)
    .abs();
  const progressEndpoint = progressDelta
    .min(progressDelta.oneMinus())
    .smoothstep(0.01, 0.022)
    .oneMinus();
  const progressEndpointNode = ring(
    progressRadius,
    FLOWER_CONTACT_HUD.primaryRingRadius,
    0.019,
  )
    .mul(progressEndpoint)
    .mul(progressReveal)
    .mul(0.92);

  const horizontalProgressWidth =
    hud.horizontalProgressRight - hud.horizontalProgressLeft;
  const horizontalProgressUv = (uv as any)();
  const horizontalProgressCoordinate = (vec2 as any)(
    horizontalProgressUv.x
      .mul(hud.horizontalProgressCarrierWidth)
      .sub(hud.horizontalProgressCarrierWidth * 0.5),
    horizontalProgressUv.y
      .mul(hud.horizontalProgressCarrierHeight)
      .sub(hud.horizontalProgressCarrierHeight * 0.5),
  );
  const horizontalProgressPosition = horizontalProgressCoordinate.x
    .sub(hud.horizontalProgressLeft)
    .div(horizontalProgressWidth)
    .clamp(0, 1);
  const horizontalProgressSpan = axisBand(
    horizontalProgressCoordinate.x,
    0,
    horizontalProgressWidth * 0.5,
  );
  const horizontalProgressBounds = rectangle(
    horizontalProgressCoordinate,
    0,
    hud.horizontalProgressCenterY,
    horizontalProgressWidth * 0.5,
    hud.horizontalProgressHalfHeight,
  );
  const horizontalProgressMask = horizontalProgressPosition
    .lessThanEqual(progressNode)
    .select(1, 0);
  const horizontalDockCenterY =
    (
      hud.horizontalProgressCarrierHeight * 0.5 +
      hud.horizontalProgressCenterY
    ) * 0.5;
  const horizontalDock = rectangle(
    horizontalProgressCoordinate,
    0,
    horizontalDockCenterY,
    0.0035,
    (
      hud.horizontalProgressCarrierHeight * 0.5 -
      hud.horizontalProgressCenterY
    ) * 0.5,
  )
    .add(rectangle(
      horizontalProgressCoordinate,
      0,
      hud.horizontalProgressCenterY,
      0.016,
      0.008,
    ))
    .mul(structureReveal)
    .mul(0.44);
  const horizontalProgressRail = rectangle(
    horizontalProgressCoordinate,
    0,
    hud.horizontalProgressCenterY,
    horizontalProgressWidth * 0.5 + 0.035,
    0.003,
  )
    .add(
      axisBand(
        horizontalProgressCoordinate.x.abs(),
        horizontalProgressWidth * 0.5 + 0.035,
        0.003,
      ).mul(axisBand(
        horizontalProgressCoordinate.y,
        hud.horizontalProgressCenterY,
        0.03,
      )),
    )
    .mul(trackReveal)
    .mul(0.42);
  const horizontalProgressCellIndex = horizontalProgressPosition
    .mul(hud.horizontalProgressSegments)
    .floor();
  const horizontalProgressCellVariation = stableHash(
    horizontalProgressCellIndex,
    52.6,
  ).mul(0.2).add(0.8);
  const horizontalProgressFill = horizontalProgressBounds
    .mul(
      segmented(
        horizontalProgressPosition,
        hud.horizontalProgressSegments,
        0.76,
      ),
    )
    .mul(horizontalProgressMask)
    .mul(horizontalProgressCellVariation)
    .mul(progressReveal)
    .mul(0.88);
  const horizontalProgressLead = horizontalProgressPosition
    .sub(progressNode)
    .abs()
    .smoothstep(0.035, 0.13)
    .oneMinus()
    .mul(horizontalProgressBounds)
    .mul(horizontalProgressMask)
    .mul(progressReveal)
    .mul(0.42);
  const horizontalProgressMilestoneShape = horizontalProgressSpan
    .mul(angularMark(
      horizontalProgressPosition,
      4,
      0.045,
    ))
    .mul(axisBand(
      horizontalProgressCoordinate.y,
      hud.horizontalProgressCenterY + 0.052,
      0.014,
    ));
  const horizontalProgressMilestones = horizontalProgressMilestoneShape
    .mul(trackReveal)
    .mul(0.38)
    .add(
      horizontalProgressMilestoneShape
        .mul(horizontalProgressMask)
        .mul(majorReveal)
        .mul(0.44),
    );
  const horizontalProgressEndpointX = progressNode
    .mul(horizontalProgressWidth)
    .add(hud.horizontalProgressLeft);
  const horizontalProgressEndpoint = axisBand(
    horizontalProgressCoordinate.x.sub(horizontalProgressEndpointX),
    0,
    0.008,
  )
    .mul(axisBand(
      horizontalProgressCoordinate.y,
      hud.horizontalProgressCenterY,
      0.04,
    ))
    .add(
      axisBand(
        horizontalProgressCoordinate.x.sub(horizontalProgressEndpointX),
        0,
        0.024,
      ).mul(axisBand(
        horizontalProgressCoordinate.y,
        hud.horizontalProgressCenterY,
        0.008,
      )),
    )
    .mul(nodeReveal)
    .mul(0.96);

  const locatorIndex = nodeAngle.mul(12).floor();
  const locatorPulse = elapsedSecondsNode
    .mul(0.48)
    .add(stableHash(locatorIndex, 6.9).mul(Math.PI * 2))
    .sin()
    .mul(0.04)
    .add(0.96);
  const nodeDots = ring(locatorNodeRadius, 0.778, 0.009)
    .mul(angularMark(nodeAngle, 12, 0.07))
    .mul(stableHash(locatorIndex, 10.7).mul(0.3).add(0.7))
    .mul(locatorPulse)
    .mul(nodeReveal)
    .mul(0.72);
  const locatorRail = ring(locatorStructureRadius, 0.778, 0.0024)
    .mul(segmented(nodeAngle.add(0.017), 12, 0.46))
    .mul(structureReveal)
    .mul(0.2);
  const shortConnectors = radialBand(locatorStructureRadius, 0.785, 0.814)
    .mul(angularMark(nodeAngle.add(0.5 / 12), 12, 0.022))
    .mul(structureReveal)
    .mul(0.22);
  const connectorNodes = ring(connectorNodeRadius, 0.812, 0.0065)
    .mul(angularMark(nodeAngle.add(0.5 / 12), 12, 0.055))
    .mul(nodeReveal)
    .mul(0.5);

  const telemetryIndex = counterTelemetryAngle.mul(30).floor();
  const telemetryPulse = elapsedSecondsNode
    .mul(0.43)
    .add(stableHash(telemetryIndex, 72.5).mul(Math.PI * 2))
    .sin()
    .mul(0.045)
    .add(0.955);
  const secondaryProgressSweep = radialBand(telemetryRadius, 0.858, 0.878)
    .mul(angularMark(counterTelemetryAngle, 30, 0.041))
    .mul(counterTelemetryMask)
    .mul(stableHash(telemetryIndex, 92.1).mul(0.3).add(0.7))
    .mul(telemetryPulse)
    .mul(telemetryReveal)
    .mul(0.55);
  const telemetryEndpointDelta = counterTelemetryAngle
    .sub(progressNode)
    .abs();
  const telemetryEndpoint = telemetryEndpointDelta
    .min(telemetryEndpointDelta.oneMinus())
    .smoothstep(0.012, 0.026)
    .oneMinus();
  const telemetryEndpointNode = ring(telemetryRadius, 0.868, 0.0095)
    .mul(telemetryEndpoint)
    .mul(telemetryReveal)
    .mul(0.68);

  const innerStatus = ring(innerStatusRadius, 0.744, 0.0033)
    .mul(segmented(innerAngle.add(0.013), 24, 0.54))
    .mul(structureReveal)
    .mul(0.27);
  const innerMicroTicks = radialBand(innerMicroRadius, 0.718, 0.734)
    .mul(angularMark(innerAngle.add(0.5 / 48), 48, 0.075))
    .mul(
      stableHash(innerAngle.mul(48).floor(), 37.1)
        .mul(0.32)
        .add(0.68),
    )
    .mul(microReveal)
    .mul(0.2);
  const tertiaryProgressTicks = ring(tertiaryTickRadius, 0.912, 0.008)
    .mul(
      segmented(
        tertiaryProgressAngle,
        FLOWER_CONTACT_HUD.fanSegments,
        0.62,
      ),
    )
    .mul(tertiaryProgressMask)
    .mul(
      stableHash(
        tertiaryProgressAngle
          .mul(FLOWER_CONTACT_HUD.fanSegments)
          .floor(),
        23.8,
      ).mul(0.34).add(0.66),
    )
    .mul(secondaryReveal)
    .mul(0.64);
  const tertiaryProgressBlocks = radialBand(tertiaryBlockRadius, 0.898, 0.924)
    .mul(
      angularMark(
        tertiaryProgressAngle,
        FLOWER_CONTACT_HUD.fanSegments,
        0.026,
      ),
    )
    .mul(tertiaryProgressMask)
    .mul(structureReveal)
    .mul(0.29);
  const innerRail = ring(innerRailRadius, 0.686, 0.0024)
    .mul(segmented(innerAngle.add(0.006), 18, 0.58))
    .mul(secondaryReveal)
    .mul(0.15);
  const tertiaryProgressNodes = ring(tertiaryNodeRadius, 0.924, 0.007)
    .mul(
      angularMark(
        tertiaryProgressAngle,
        FLOWER_CONTACT_HUD.fanSegments,
        0.047,
      ),
    )
    .mul(tertiaryProgressMask)
    .mul(nodeReveal)
    .mul(0.58);

  const scanPulse = (elapsedSecondsNode
    .mul(0.052)
    .add(clockwiseFromTop)
    .fract()
    .sub(0.5)
    .abs()
    .smoothstep(0.009, 0.026)
    .oneMinus())
    .mul(ring(scanRadius, 0.852, 0.005))
    .mul(scanReveal)
    .mul(0.33);
  const energy = outerHalo
    .add(outerMicroTicks)
    .add(outerMajorTicks)
    .add(outerTechnicalRail)
    .add(outerJunctionNodes)
    .add(progressTrack)
    .add(progressRing)
    .add(progressMicroTicks)
    .add(progressEndpointNode)
    .add(nodeDots)
    .add(locatorRail)
    .add(shortConnectors)
    .add(connectorNodes)
    .add(secondaryProgressSweep)
    .add(telemetryEndpointNode)
    .add(innerStatus)
    .add(innerMicroTicks)
    .add(tertiaryProgressTicks)
    .add(tertiaryProgressBlocks)
    .add(innerRail)
    .add(tertiaryProgressNodes)
    .add(scanPulse)
    .clamp(0, 1);
  const horizontalProgressBackdrop = rectangle(
    horizontalProgressCoordinate,
    0,
    hud.horizontalProgressCenterY,
    horizontalProgressWidth * 0.5 + 0.052,
    0.052,
  )
    .mul(trackReveal)
    .mul(0.64);
  const horizontalProgressSignal = horizontalDock
    .add(horizontalProgressRail)
    .add(horizontalProgressFill)
    .add(horizontalProgressLead)
    .add(horizontalProgressMilestones)
    .add(horizontalProgressEndpoint)
    .clamp(0, 1);
  const horizontalProgressDepartureOpacity = departureRadiusNodes[6]
    .smoothstep(0.01, 0.16)
    .oneMinus();
  const horizontalProgressEnergy = horizontalProgressBackdrop
    .add(horizontalProgressSignal)
    .clamp(0, 1)
    .mul(horizontalProgressDepartureOpacity);
  const palette = FLOWER_CONTACT_HUD_PALETTE;
  const basePaletteColor = hudProgressColor(
    progressNode,
    (vec3 as any)(...palette.coolBlue),
    (vec3 as any)(...palette.saturatedOrange),
    (vec3 as any)(...palette.dangerRed),
  );
  const highlightPaletteColor = hudProgressColor(
    progressNode,
    (vec3 as any)(...palette.coolHighlight),
    (vec3 as any)(...palette.orangeHighlight),
    (vec3 as any)(...palette.dangerHighlight),
  );
  const colorNode = (mix as any)(
    basePaletteColor,
    highlightPaletteColor,
    progressRing
      .add(secondaryProgressSweep)
      .add(tertiaryProgressTicks)
      .add(horizontalProgressFill)
      .add(horizontalProgressLead)
      .add(horizontalProgressEndpoint)
      .add(nodeDots)
      .add(scanPulse)
      .clamp(0, 1),
  ).mul(energy.mul(0.72).add(0.3));
  const horizontalProgressColorNode = (mix as any)(
    (vec3 as any)(0.006, 0.014, 0.03),
    (mix as any)(
      basePaletteColor,
      highlightPaletteColor,
      horizontalProgressFill
        .add(horizontalProgressLead)
        .add(horizontalProgressEndpoint)
        .clamp(0, 1),
    ),
    horizontalProgressSignal,
  ).mul(horizontalProgressEnergy.mul(0.72).add(0.3));

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.colorNode = colorNode;
  material.opacityNode = energy.mul(opacityNode).mul(0.78);
  material.blending = THREE.AdditiveBlending;
  material.forceSinglePass = true;
  const progressBarMaterial = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  progressBarMaterial.colorNode = horizontalProgressColorNode;
  progressBarMaterial.opacityNode = horizontalProgressEnergy
    .mul(opacityNode)
    .mul(0.78);
  progressBarMaterial.blending = THREE.NormalBlending;
  progressBarMaterial.forceSinglePass = true;
  return {
    material,
    progressBarMaterial,
    nodes: {
      progressNode,
      opacityNode,
      elapsedSecondsNode,
      revealSecondsNode,
      departureRadiusNodes,
      departureLaunchRadiusNodes,
      departureVibrationWeightNodes,
      departureActiveNode,
      departureCarrierOverscanNode,
    },
  };
}
