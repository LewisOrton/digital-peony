import {
  attribute,
  cameraViewMatrix,
  faceDirection,
  float,
  instanceIndex,
  modelNormalMatrix,
  modelViewMatrix,
  modelWorldMatrix,
  positionLocal,
  uniform,
  uv,
  vec3,
  varying,
} from 'three/tsl';
import {
  CREASE_PHASE_HASH_SCALE,
  CREASE_PHASE_INDEX_SCALE,
  CREASE_PHASE_RANGE,
  WRINKLE_PHASE_V_SCALE,
  WRINKLE_V_FREQUENCY_DIVISOR,
} from './flower-mode';
import {
  PETAL_GEOMETRY,
  type PetalDeformationInputs,
  type PetalDeformationUniforms,
} from './geometry-contract';
import {
  signedNoise2DNodes,
  signedNoiseNodes,
} from '../rendering/noise-nodes';
import { PETAL_DEFAULTS } from './petal';
import type { ReadonlyPetalGeometrySettings } from './petal';
import type { FlowerBaseSettings } from './flower-base';
import type { SimulationSettings } from '../simulation/simulation-state';
import {
  createLivingFlowerRuntime,
  type LivingFlowerRuntime,
} from '../simulation/living-flower-runtime';
import { createFlowerContactGlitch } from '../rendering/flower-contact-glitch';
import {
  type FlowerStageThreeMotion,
} from '../presentation/flower-stage-three';
import {
  transformFlowerStageThreePosition,
} from '../presentation/flower-stage-three-tsl';

export type PetalDeformation = {
  nodes: {
    petalPosition: any;
    flowerPosition: any;
    flowerCurvinessDelta: any;
    flowerIntroStartCurvinessDelta: any;
    flowerWorldNormal: any;
    flowerViewNormal: any;
    petalViewTangentAcross: any;
    petalViewTangentAlong: any;
    flowerViewTangentAcross: any;
    flowerViewTangentAlong: any;
    uv: any;
    shapeU: any;
  };
  uniforms: PetalDeformationUniforms;
  simulation: LivingFlowerRuntime;
  interactionGlitch: ReturnType<typeof createFlowerContactGlitch>;
  setFlowerStageThreeProgress(
    progress: number,
    motion: FlowerStageThreeMotion,
  ): void;
};

export function createPetalDeformation(
  inputs: PetalDeformationInputs,
  petalSettings: ReadonlyPetalGeometrySettings,
  simulationSettings: SimulationSettings,
  flowerBaseSettings: FlowerBaseSettings,
): PetalDeformation {
  const creaseFrequencyNode: any = uniform(inputs.creaseFrequency);
  const creaseAmplitudeNode: any = uniform(inputs.creaseAmplitude);
  const wrinkleFrequencyNode: any = uniform(inputs.wrinkleFrequency);
  const wrinkleAmplitudeNode: any = uniform(inputs.wrinkleAmplitude);
  const curvinessNode: any = uniform(inputs.curviness);
  const flowerStageThreeProgressNode: any = uniform(0);
  const flowerStageThreeSpreadProgressNode: any = uniform(0);
  const flowerStageThreeReturnActiveNode: any = uniform(0);
  const flowerStageThreeReturnProgressNode: any = uniform(0);
  const flowerStageThreeReturnStartProgressNode: any = uniform(0);
  const rawPetalPositionNode: any = attribute('position', 'vec3');
  const instanceBasisXNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.basisX,
    'vec3',
  );
  const instanceBasisYNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.basisY,
    'vec3',
  );
  const instanceBasisZNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.basisZ,
    'vec3',
  );
  const instanceOutnessNode: any = attribute(
    PETAL_GEOMETRY.instanceAttributes.outness,
    'float',
  );
  const makeVec3 = vec3 as (...values: any[]) => any;
  const localPositionNode: any = positionLocal;
  const petalInstanceIndexNode: any = instanceIndex;
  const viewMatrixNode: any = cameraViewMatrix;
  const normalMatrixNode: any = modelNormalMatrix;
  const visibleFaceDirectionNode: any = faceDirection;
  const uvNode: any = (uv as () => any)();
  const shapeGridNode: any = attribute(
    PETAL_GEOMETRY.shapeCoordinate.attribute,
    'vec3',
  );
  const shapeUNode: any = shapeGridNode.x;
  const rootToTipNode = uvNode.y;
  const simulation = createLivingFlowerRuntime(
    inputs,
    petalSettings,
    simulationSettings,
    flowerBaseSettings,
  );
  const gridCoordinateNode: any = shapeGridNode.yz;

  function creaseAmountNode(phaseNode: any) {
    const { signedNoise } = signedNoiseNodes(
      uvNode.x.mul(creaseFrequencyNode).add(phaseNode),
    );
    return signedNoise
      .abs()
      .div(0.7)
      .clamp(0, 1)
      .mul(rootToTipNode)
      .mul(creaseAmplitudeNode)
      .mul(PETAL_DEFAULTS.height);
  }

  const petalPositionNode = localPositionNode.sub(
    makeVec3(0, creaseAmountNode(0), 0),
  );
  const instancePhaseNode = (float as any)(
    petalInstanceIndexNode.add(1),
  )
    .mul(CREASE_PHASE_INDEX_SCALE)
    .sin()
    .mul(CREASE_PHASE_HASH_SCALE)
    .fract()
    .mul(CREASE_PHASE_RANGE);
  const creasedLocalYNode = rawPetalPositionNode.y.sub(
    creaseAmountNode(instancePhaseNode),
  );
  const bendTNode = rootToTipNode.mul(
    rootToTipNode.div(0.025).negate().exp().oneMinus(),
  );
  const lateralCoordinateNode = shapeUNode.mul(2).sub(1);
  function curvedPetalState(curviness: any) {
    const bendAngle = curviness.mul(-0.95).mul(bendTNode);
    const hasBend = bendAngle.abs().greaterThan(0.000001);
    const safeBendAngle = hasBend.select(bendAngle, 1);
    const arcScale = hasBend.select(
      bendAngle.sin().div(safeBendAngle),
      1,
    );
    const arcDepth = hasBend.select(
      creasedLocalYNode
        .mul(bendAngle.cos().oneMinus())
        .div(safeBendAngle),
      0,
    );
    const lateralScoop = curviness
      .mul(PETAL_DEFAULTS.height * 0.12)
      .mul(bendTNode)
      .mul(lateralCoordinateNode.mul(lateralCoordinateNode));
    const lateralSlope = curviness
      .mul(PETAL_DEFAULTS.height * 0.12 * 4)
      .mul(bendTNode)
      .mul(lateralCoordinateNode);
    const tangentAcross = makeVec3(
      1,
      lateralSlope.mul(bendAngle.sin()),
      lateralSlope.mul(bendAngle.cos()).negate(),
    ).normalize();
    const initialTangentAlong = makeVec3(
      0,
      bendAngle.cos(),
      bendAngle.sin(),
    );
    const tangentAlong = initialTangentAlong
      .sub(
        tangentAcross.mul(
          initialTangentAlong.dot(tangentAcross),
        ),
      )
      .normalize();
    return {
      position: makeVec3(
        rawPetalPositionNode.x,
        creasedLocalYNode
          .mul(arcScale)
          .add(lateralScoop.mul(bendAngle.sin())),
        arcDepth.sub(lateralScoop.mul(bendAngle.cos())),
      ),
      tangentAcross,
      tangentAlong,
      normal: tangentAcross.cross(tangentAlong).normalize(),
    };
  }
  const curvedPetal = curvedPetalState(curvinessNode);
  const introStartCurvedPetal = curvedPetalState((float as any)(-0.5));
  const curvedLocalPositionNode = curvedPetal.position;
  const averageCurvedNormalNode = curvedPetal.normal;
  const wrinkleNoiseNodes = signedNoise2DNodes(
    uvNode.x.mul(wrinkleFrequencyNode).add(instancePhaseNode),
    rootToTipNode
      .mul(
        wrinkleFrequencyNode.div(
          WRINKLE_V_FREQUENCY_DIVISOR,
        ),
      )
      .add(instancePhaseNode.mul(WRINKLE_PHASE_V_SCALE)),
  );
  const signedWrinkleSignalNode = wrinkleNoiseNodes.signedNoise
    .div(0.7)
    .clamp(-1, 1);
  const wrinkleFalloffNode = rootToTipNode.pow(3);
  const wrinkleAmountNode = signedWrinkleSignalNode
    .mul(wrinkleFalloffNode)
    .mul(wrinkleAmplitudeNode)
    .mul(PETAL_DEFAULTS.height);
  const wrinkledLocalPositionNode = curvedLocalPositionNode.add(
    averageCurvedNormalNode.mul(wrinkleAmountNode),
  );
  const uncurvedWrinkledLocalPositionNode = makeVec3(
    rawPetalPositionNode.x,
    creasedLocalYNode,
    wrinkleAmountNode,
  );
  const localCurvinessDeltaNode = wrinkledLocalPositionNode.sub(
    uncurvedWrinkledLocalPositionNode,
  );
  const introStartWrinkledLocalPositionNode =
    introStartCurvedPetal.position.add(
      introStartCurvedPetal.normal.mul(wrinkleAmountNode),
    );
  const localIntroStartCurvinessDeltaNode =
    introStartWrinkledLocalPositionNode.sub(
      uncurvedWrinkledLocalPositionNode,
    );
  const transformDirection = (direction: any) =>
    instanceBasisXNode
      .mul(direction.x)
      .add(instanceBasisYNode.mul(direction.y))
      .add(instanceBasisZNode.mul(direction.z));
  const flowerCurvinessDeltaNode = transformDirection(
    localCurvinessDeltaNode,
  );
  const flowerIntroStartCurvinessDeltaNode = transformDirection(
    localIntroStartCurvinessDeltaNode,
  );
  const simulationVertex = simulation.directVertexState(
    petalInstanceIndexNode,
    gridCoordinateNode,
  );
  const interactionGlitch = createFlowerContactGlitch(
    simulationVertex.position,
    simulation.trajectoryGpu,
  );
  const petalRootPositionNode = simulation.directPetalRootPosition(
    petalInstanceIndexNode,
  );
  const petalRestRootPositionNode = simulation.compute
    .renderRestPositionStorage
    .element(
      petalInstanceIndexNode
        .mul(simulation.compute.renderVertexCountNode)
        .add(simulation.compute.renderColumnsNode.sub(1).div(2)),
    )
    .xyz;
  const flowerPositionNode = transformFlowerStageThreePosition({
    petal: petalInstanceIndexNode,
    position: interactionGlitch.positionNode,
    rootPosition: petalRootPositionNode,
    spreadRootPosition: petalRestRootPositionNode,
    outness: instanceOutnessNode,
    activePetalCount: simulation.compute.activePetalCountNode,
    progress: flowerStageThreeProgressNode,
    spreadProgress: flowerStageThreeSpreadProgressNode,
    returnActive: flowerStageThreeReturnActiveNode,
    returnProgress: flowerStageThreeReturnProgressNode,
    returnStartProgress: flowerStageThreeReturnStartProgressNode,
  });
  const dynamicTangentAcrossNode = simulationVertex.acrossTangent;
  const dynamicTangentAlongNode = simulationVertex.alongTangent;
  const flowerObjectNormalNode = simulationVertex.normal;
  const flowerWorldNormalNode = normalMatrixNode
    .mul(flowerObjectNormalNode)
    .normalize();
  const flowerWorldNormalVaryingNode = (varying as any)(
    flowerWorldNormalNode,
    'vFlowerWorldNormal',
  ).normalize();
  const flowerViewNormalNode = flowerWorldNormalVaryingNode
    .transformDirection(viewMatrixNode)
    .normalize()
    .mul(visibleFaceDirectionNode);
  const petalViewTangentAcrossNode = makeVec3(1, 0, 0)
    .transformDirection(modelViewMatrix)
    .normalize();
  const petalViewTangentAlongNode = makeVec3(0, 1, 0)
    .transformDirection(modelViewMatrix)
    .normalize();
  const flowerViewTangentAcrossNode = (varying as any)(
    dynamicTangentAcrossNode
      .transformDirection(modelWorldMatrix)
      .normalize(),
    'vFlowerWorldTangentAcross',
  )
    .transformDirection(viewMatrixNode)
    .normalize();
  const flowerViewTangentAlongNode = (varying as any)(
    dynamicTangentAlongNode
      .transformDirection(modelWorldMatrix)
      .normalize(),
    'vFlowerWorldTangentAlong',
  )
    .transformDirection(viewMatrixNode)
    .normalize();
  function setFlowerStageThreeProgress(
    progress: number,
    motion: FlowerStageThreeMotion,
  ) {
    flowerStageThreeProgressNode.value = Math.min(1, Math.max(0, progress));
    flowerStageThreeSpreadProgressNode.value = Math.min(
      1,
      Math.max(0, motion.spreadProgress),
    );
    flowerStageThreeReturnActiveNode.value =
      motion.phase === 'returning' ? 1 : 0;
    flowerStageThreeReturnProgressNode.value = Math.min(
      1,
      Math.max(0, motion.returnProgress),
    );
    flowerStageThreeReturnStartProgressNode.value = Math.min(
      1,
      Math.max(0, motion.returnStartProgress),
    );
  }

  return {
    nodes: {
      petalPosition: petalPositionNode,
      flowerPosition: flowerPositionNode,
      flowerCurvinessDelta: flowerCurvinessDeltaNode,
      flowerIntroStartCurvinessDelta:
        flowerIntroStartCurvinessDeltaNode,
      flowerWorldNormal: flowerWorldNormalVaryingNode,
      flowerViewNormal: flowerViewNormalNode,
      petalViewTangentAcross: petalViewTangentAcrossNode,
      petalViewTangentAlong: petalViewTangentAlongNode,
      flowerViewTangentAcross: flowerViewTangentAcrossNode,
      flowerViewTangentAlong: flowerViewTangentAlongNode,
      uv: uvNode,
      shapeU: shapeUNode,
    },
    uniforms: {
      curviness: curvinessNode,
      creaseFrequency: creaseFrequencyNode,
      creaseAmplitude: creaseAmplitudeNode,
      wrinkleFrequency: wrinkleFrequencyNode,
      wrinkleAmplitude: wrinkleAmplitudeNode,
    },
    simulation,
    interactionGlitch,
    setFlowerStageThreeProgress,
  };
}
