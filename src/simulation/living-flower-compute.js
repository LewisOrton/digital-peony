// Dynamic TSL graph construction is intentionally isolated from TypeScript.
import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  attributeArray,
  float,
  instanceIndex,
  uniform,
  uint,
  vec3,
  vec4,
} from 'three/tsl';
import {
  LIVING_FLOWER,
  LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT,
  LIVING_FLOWER_MAXIMUM_PARTICLES,
  LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES,
} from './living-flower-contract';
import { SIMULATION_DEFAULTS } from './simulation-state';
import {
  createFlowerTrajectoryGpu,
} from '../interaction/flower-trajectory-gpu';

export function createLivingFlowerCompute(
  simulationSettings,
  flowerBaseSettings,
) {
  const positionAStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 4),
    'vec4',
  );
  const positionBStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 4),
    'vec4',
  );
  const restPositionStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 4),
    'vec4',
  );
  const renderRestPositionStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES * 4),
    'vec4',
  );
  const velocityStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 4),
    'vec4',
  );
  const constraintLambdaStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 8),
    'vec4',
  );
  const constraintDeltaStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_PARTICLES * 8),
    'vec4',
  );
  const collisionCandidateStorage = (attributeArray)(
    new Float32Array(
      LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES *
        LIVING_FLOWER.maximumCollisionCandidates *
        4,
    ),
    'vec4',
  );
  const collisionCorrectionStorage = (attributeArray)(
    new Float32Array(LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES * 4),
    'vec4',
  );
  const activePetalCountNode = (uniform)(0, 'uint');
  const gridColumnsNode = (uniform)(1, 'uint');
  const gridRowsNode = (uniform)(1, 'uint');
  const gridVertexCountNode = (uniform)(1, 'uint');
  const gridCellCountNode = (uniform)(0, 'uint');
  const renderColumnsNode = (uniform)(1, 'uint');
  const renderRowsNode = (uniform)(1, 'uint');
  const renderVertexCountNode = (uniform)(1, 'uint');
  const simulationTimeNode = (uniform)(0);
  const stepSecondsNode = (uniform)(LIVING_FLOWER.fixedStepSeconds);
  const turbulenceStrengthNode = (uniform)(
    simulationSettings.turbulenceStrength,
  );
  const turbulenceScaleNode = (uniform)(
    simulationSettings.turbulenceScale,
  );
  const flowerRadiusNode = (uniform)(flowerBaseSettings.radius);
  const turbulenceSpeedNode = (uniform)(
    simulationSettings.turbulenceSpeed,
  );
  const interactionForceNode = (uniform)(
    new THREE.Vector3(),
  );
  const interactionRadiusNode = (uniform)(
    LIVING_FLOWER.interactionRadius,
  );
  const interactionReadinessNode = (uniform)(0);
  const interactionMinimumOutnessNode = (uniform)(1);

  const activeParticleCountNode = activePetalCountNode.mul(
    gridVertexCountNode,
  );
  const activeRenderParticleCountNode = activePetalCountNode.mul(
    renderVertexCountNode,
  );
  const trajectoryGpu = createFlowerTrajectoryGpu({
    positionStorage: positionAStorage,
    activePetalCountNode,
    gridColumnsNode,
    gridVertexCountNode,
    gridCellCountNode,
    interactionReadinessNode,
    interactionMinimumOutnessNode,
  });

  function xzStreamTurbulence(position) {
    const scale = turbulenceScaleNode
      .mul(flowerRadiusNode)
      .max(0.0001);
    const coordinateX = position.x.div(scale);
    const coordinateZ = position.z.div(scale);
    const time = simulationTimeNode.mul(turbulenceSpeedNode);
    const primaryWave = coordinateX
      .mul(0.8)
      .add(coordinateZ.mul(0.6))
      .add(time.mul(0.37))
      .cos();
    const secondaryWave = coordinateX
      .mul(-0.854178)
      .add(coordinateZ.mul(1.708356))
      .sub(time.mul(0.23))
      .add(2.3)
      .cos();
    return (vec3)(
      primaryWave
        .mul(0.39)
        .add(secondaryWave.mul(0.1341640786)),
      0,
      primaryWave
        .mul(-0.52)
        .add(secondaryWave.mul(0.0670820393)),
    );
  }

  const integrateNode = (Fn)(() => {
    const index = instanceIndex;
    (If)(index.lessThan(activeParticleCountNode), () => {
      const lambdaOffset = index.mul((uint)(2));
      constraintLambdaStorage
        .element(lambdaOffset)
        .assign((vec4)(0));
      constraintLambdaStorage
        .element(lambdaOffset.add(1))
        .assign((vec4)(0));
      constraintDeltaStorage
        .element(lambdaOffset)
        .assign((vec4)(0));
      constraintDeltaStorage
        .element(lambdaOffset.add(1))
        .assign((vec4)(0));
      const gridIndex = index.mod(
        gridVertexCountNode,
      );
      const row = gridIndex.div(gridColumnsNode);
      const petalIndex = index.div(
        gridVertexCountNode,
      );
      const restData = restPositionStorage.element(index);
      const rest = restData.xyz;
      const inverseMass = restData.w;
      const current = positionAStorage.element(index).xyz;
      const previousVelocity = velocityStorage.element(index).xyz;
      const rootToTip = (float)(row).div(
        (float)(gridRowsNode.sub(1)),
      );

      (If)(inverseMass.lessThanEqual(0), () => {
        positionBStorage.element(index).assign(restData);
        velocityStorage.element(index).assign(
          (vec4)(0, 0, 0, 0),
        );
      }).Else(() => {
        const phase = (float)(petalIndex.add(1))
          .mul(12.9898)
          .sin()
          .mul(43758.5453)
          .fract()
          .mul(6.28318530718);
        const petalVariation = phase.sin().mul(0.06).add(1);
        const tipWeight = rootToTip
          .sub(0.04)
          .div(0.96)
          .clamp(0, 1)
          .pow(1.65);
        const rootCenterIndex = petalIndex
          .mul(gridVertexCountNode)
          .add(gridColumnsNode.div((uint)(2)));
        const rootLeftIndex = petalIndex.mul(
          gridVertexCountNode,
        );
        const rootRightIndex = rootLeftIndex.add(
          gridColumnsNode.sub(1),
        );
        const tipCenterIndex = rootCenterIndex.add(
          gridRowsNode.sub(1).mul(gridColumnsNode),
        );
        const rootCenter = restPositionStorage.element(rootCenterIndex).xyz;
        const petalFlow = xzStreamTurbulence(rootCenter);
        const turbulenceAcceleration = petalFlow
          .mul(turbulenceStrengthNode)
          .mul(petalVariation)
          .mul(tipWeight)
          .mul(LIVING_FLOWER.turbulenceAcceleration);
        const rootAxis = restPositionStorage
          .element(rootRightIndex)
          .xyz
          .sub(restPositionStorage.element(rootLeftIndex).xyz)
          .normalize();
        const petalAlong = restPositionStorage
          .element(tipCenterIndex)
          .xyz
          .sub(rootCenter)
          .normalize();
        const petalNormal = rootAxis.cross(petalAlong).normalize();
        const organicAngle = petalFlow
          .dot(petalNormal)
          .mul(LIVING_FLOWER.organicOpennessRadians)
          .mul(petalVariation)
          .mul(
            turbulenceStrengthNode
              .div(SIMULATION_DEFAULTS.turbulenceStrength)
              .clamp(0, 1.6),
          );
        const restFromRoot = rest.sub(rootCenter);
        const organicTarget = rootCenter
          .add(restFromRoot.mul(organicAngle.cos()))
          .add(rootAxis.cross(restFromRoot).mul(organicAngle.sin()))
          .add(
            rootAxis.mul(
              rootAxis
                .dot(restFromRoot)
                .mul(organicAngle.cos().oneMinus()),
            ),
          );
        const organicAcceleration = organicTarget
          .sub(current)
          .mul(LIVING_FLOWER.organicReturnAcceleration)
          .mul(tipWeight);

        const interactionAcceleration = (vec3)(0, 0, 0).toVar();
        (Loop)(
          {
            start: (uint)(0),
            end: trajectoryGpu.sampleCountNode,
            type: 'uint',
            condition: '<',
          },
          ({ i: sample }) => {
            const hit = trajectoryGpu.hitStorage.element(sample);
            (If)(hit.w.greaterThan(0), () => {
              const radiusAmount = current
                  .sub(hit.xyz)
                  .length()
                  .div(interactionRadiusNode)
                  .clamp(0, 1);
              const smoothBoundary = radiusAmount
                .mul(radiusAmount)
                .mul(radiusAmount)
                .mul(
                  radiusAmount
                    .mul(radiusAmount.mul(6).sub(15))
                    .add(10),
                );
              const falloff = smoothBoundary
                .oneMinus()
                .mul(tipWeight);
              interactionAcceleration.addAssign(
                interactionForceNode
                  .mul(falloff)
                  .mul(
                    (float)(1).div(
                      (float)(trajectoryGpu.sampleCountNode).max(1),
                    ),
                  ),
              );
            });
          },
        );
        interactionAcceleration.mulAssign(
          LIVING_FLOWER.interactionBrushStrength,
        );
        const damping = stepSecondsNode
          .mul(-LIVING_FLOWER.velocityDampingPerSecond)
          .exp();
        const velocity = previousVelocity
          .mul(damping)
          .add(
            turbulenceAcceleration
              .add(organicAcceleration)
              .add(interactionAcceleration)
              .mul(stepSecondsNode),
          );
        const predicted = current.add(velocity.mul(stepSecondsNode));
        velocityStorage
          .element(index)
          .assign((vec4)(velocity, 0));
        positionBStorage
          .element(index)
          .assign((vec4)(predicted, inverseMass));
      });
    });
  })().compute(LIVING_FLOWER_MAXIMUM_PARTICLES);

  const lambdaComponents = ['x', 'y', 'z', 'w'];

  function createLambdaPass(sourceStorage) {
    return (Fn)(() => {
      const index = instanceIndex;
      (If)(index.lessThan(activeParticleCountNode), () => {
        const gridIndex = index.mod(
          gridVertexCountNode,
        );
        const column = gridIndex.mod(gridColumnsNode);
        const row = gridIndex.div(gridColumnsNode);
        const restData = restPositionStorage.element(index);
        const inverseMass = restData.w;
        const current = sourceStorage.element(index).xyz;
        const lambdaOffset = index.mul((uint)(2));
        const lambda0 = constraintLambdaStorage
          .element(lambdaOffset)
          .toVar();
        const lambda1 = constraintLambdaStorage
          .element(lambdaOffset.add(1))
          .toVar();
        const delta0 = (vec4)(0).toVar();
        const delta1 = (vec4)(0).toVar();

        const updateDistanceLambda = (
          neighborIndex,
          compliance,
          slot,
        ) => {
          const neighbor = sourceStorage.element(neighborIndex).xyz;
          const neighborRest = restPositionStorage.element(neighborIndex);
          const delta = current.sub(neighbor);
          const distance = delta.length().max(0.000001);
          const restLength = restData.xyz
            .sub(neighborRest.xyz)
            .length();
          const alpha = (float)(compliance).div(
            stepSecondsNode.mul(stepSecondsNode),
          );
          const lambdaGroup = slot < 4 ? lambda0 : lambda1;
          const deltaGroup = slot < 4 ? delta0 : delta1;
          const component = lambdaComponents[slot % 4];
          const previousLambda = lambdaGroup[component];
          const deltaLambda = distance
            .sub(restLength)
            .negate()
            .sub(alpha.mul(previousLambda))
            .div(inverseMass.add(neighborRest.w).add(alpha));
          lambdaGroup[component].assign(
            previousLambda.add(deltaLambda),
          );
          deltaGroup[component].assign(deltaLambda);
        };

        const updateCurvatureLambda = (
          previousIndex,
          nextIndex,
          slot,
        ) => {
          const previous = sourceStorage.element(previousIndex).xyz;
          const next = sourceStorage.element(nextIndex).xyz;
          const previousRest =
            restPositionStorage.element(previousIndex);
          const nextRest = restPositionStorage.element(nextIndex);
          const previousLength = restData.xyz
            .sub(previousRest.xyz)
            .length();
          const nextLength = nextRest.xyz
            .sub(restData.xyz)
            .length();
          const spanLength = previousLength
            .add(nextLength)
            .max(0.000001);
          const nextWeight = previousLength.div(spanLength);
          const previousWeight = nextWeight.oneMinus();
          const restCurvature = restData.xyz.sub(
            previousRest.xyz
              .mul(previousWeight)
              .add(nextRest.xyz.mul(nextWeight)),
          );
          const curvatureError = current
            .sub(
              previous
                .mul(previousWeight)
                .add(next.mul(nextWeight)),
            )
            .sub(restCurvature);
          const errorLength = curvatureError.length();
          const alpha = (float)(
            LIVING_FLOWER.curvatureCompliance,
          ).div(
            stepSecondsNode.mul(stepSecondsNode),
          );
          const lambdaGroup = slot < 4 ? lambda0 : lambda1;
          const deltaGroup = slot < 4 ? delta0 : delta1;
          const component = lambdaComponents[slot % 4];
          const previousLambda = lambdaGroup[component];
          const deltaLambda = (float)(0).toVar();
          (If)(errorLength.greaterThan(0.000001), () => {
            const gradientMass = inverseMass
              .add(
                previousRest.w.mul(
                  previousWeight.mul(previousWeight),
                ),
              )
              .add(
                nextRest.w.mul(nextWeight.mul(nextWeight)),
              );
            deltaLambda.assign(
              errorLength
                .negate()
                .sub(alpha.mul(previousLambda))
                .div(gradientMass.add(alpha)),
            );
          });
          lambdaGroup[component].assign(
            previousLambda.add(deltaLambda),
          );
          deltaGroup[component].assign(deltaLambda);
        };

        (If)(inverseMass.lessThanEqual(0), () => {
          lambda0.assign((vec4)(0));
          lambda1.assign((vec4)(0));
        }).Else(() => {
          (If)(
            column.add(1).lessThan(gridColumnsNode),
            () => {
              updateDistanceLambda(
                index.add(1),
                LIVING_FLOWER.stretchCompliance,
                0,
              );
            },
          );
          (If)(
            row.add(1).lessThan(gridRowsNode),
            () => {
              updateDistanceLambda(
                index.add(gridColumnsNode),
                LIVING_FLOWER.stretchCompliance,
                1,
              );
            },
          );
          (If)(
            column
              .add(1)
              .lessThan(gridColumnsNode)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              updateDistanceLambda(
                index.add(gridColumnsNode.add(1)),
                LIVING_FLOWER.shearCompliance,
                2,
              );
            },
          );
          (If)(
            column
              .greaterThan(0)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              updateDistanceLambda(
                index.add(gridColumnsNode.sub(1)),
                LIVING_FLOWER.shearCompliance,
                3,
              );
            },
          );
          (If)(
            column
              .greaterThan(0)
              .and(column.add(1).lessThan(gridColumnsNode)),
            () => {
              updateCurvatureLambda(
                index.sub(1),
                index.add(1),
                4,
              );
            },
          );
          (If)(
            row
              .greaterThan(0)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              updateCurvatureLambda(
                index.sub(gridColumnsNode),
                index.add(gridColumnsNode),
                5,
              );
            },
          );
        });
        constraintLambdaStorage
          .element(lambdaOffset)
          .assign(lambda0);
        constraintLambdaStorage
          .element(lambdaOffset.add(1))
          .assign(lambda1);
        constraintDeltaStorage
          .element(lambdaOffset)
          .assign(delta0);
        constraintDeltaStorage
          .element(lambdaOffset.add(1))
          .assign(delta1);
      });
    })().compute(LIVING_FLOWER_MAXIMUM_PARTICLES);
  }

  function createConstraintPass(sourceStorage, targetStorage) {
    return (Fn)(() => {
      const index = instanceIndex;
      (If)(index.lessThan(activeParticleCountNode), () => {
        const gridIndex = index.mod(
          gridVertexCountNode,
        );
        const column = gridIndex.mod(gridColumnsNode);
        const row = gridIndex.div(gridColumnsNode);
        const restData = restPositionStorage.element(index);
        const inverseMass = restData.w;
        const current = sourceStorage.element(index).xyz;
        const correction = (vec3)(0, 0, 0).toVar();
        const correctionWeight = (float)(0).toVar();

        const addLambdaCorrection = (
          ownerIndex,
          otherIndex,
          slot,
        ) => {
          const other = sourceStorage.element(otherIndex).xyz;
          const delta = current.sub(other);
          const distance = delta.length().max(0.000001);
          const lambdaOffset = ownerIndex
            .mul((uint)(2))
            .add((uint)(slot < 4 ? 0 : 1));
          const deltaLambda = constraintDeltaStorage.element(
            lambdaOffset,
          )[lambdaComponents[slot % 4]];
          correction.addAssign(
            delta
              .div(distance)
              .mul(deltaLambda)
              .mul(inverseMass),
          );
          correctionWeight.addAssign(1);
        };

        const addCurvatureCorrection = (
          ownerIndex,
          previousIndex,
          nextIndex,
          slot,
          role,
        ) => {
          const owner = sourceStorage.element(ownerIndex).xyz;
          const previous = sourceStorage.element(previousIndex).xyz;
          const next = sourceStorage.element(nextIndex).xyz;
          const ownerRest =
            restPositionStorage.element(ownerIndex);
          const previousRest =
            restPositionStorage.element(previousIndex);
          const nextRest = restPositionStorage.element(nextIndex);
          const previousLength = ownerRest.xyz
            .sub(previousRest.xyz)
            .length();
          const nextLength = nextRest.xyz
            .sub(ownerRest.xyz)
            .length();
          const spanLength = previousLength
            .add(nextLength)
            .max(0.000001);
          const nextWeight = previousLength.div(spanLength);
          const previousWeight = nextWeight.oneMinus();
          const restCurvature = ownerRest.xyz.sub(
            previousRest.xyz
              .mul(previousWeight)
              .add(nextRest.xyz.mul(nextWeight)),
          );
          const curvatureError = owner
            .sub(
              previous
                .mul(previousWeight)
                .add(next.mul(nextWeight)),
            )
            .sub(restCurvature);
          const errorLength = curvatureError.length();
          const lambdaOffset = ownerIndex
            .mul((uint)(2))
            .add((uint)(1));
          const deltaLambda = constraintDeltaStorage.element(
            lambdaOffset,
          )[lambdaComponents[slot % 4]];
          const coefficient =
            role === 'center'
              ? (float)(1)
              : role === 'previous'
                ? previousWeight.negate()
                : nextWeight.negate();
          correction.addAssign(
            curvatureError
              .div(errorLength.max(0.000001))
              .mul(deltaLambda)
              .mul(coefficient)
              .mul(inverseMass),
          );
          correctionWeight.addAssign(1);
        };

        (If)(inverseMass.lessThanEqual(0), () => {
          targetStorage.element(index).assign(restData);
        }).Else(() => {
          (If)(column.greaterThan(0), () => {
            addLambdaCorrection(
              index.sub(1),
              index.sub(1),
              0,
            );
          });
          (If)(
            column.add(1).lessThan(gridColumnsNode),
            () => {
              addLambdaCorrection(index, index.add(1), 0);
            },
          );
          (If)(row.greaterThan(0), () => {
            addLambdaCorrection(
              index.sub(gridColumnsNode),
              index.sub(gridColumnsNode),
              1,
            );
          });
          (If)(
            row.add(1).lessThan(gridRowsNode),
            () => {
              addLambdaCorrection(
                index,
                index.add(gridColumnsNode),
                1,
              );
            },
          );
          (If)(
            column
              .greaterThan(0)
              .and(row.greaterThan(0)),
            () => {
              addLambdaCorrection(
                index.sub(gridColumnsNode.add(1)),
                index.sub(gridColumnsNode.add(1)),
                2,
              );
            },
          );
          (If)(
            column
              .add(1)
              .lessThan(gridColumnsNode)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              addLambdaCorrection(
                index,
                index.add(gridColumnsNode.add(1)),
                2,
              );
            },
          );
          (If)(
            column
              .add(1)
              .lessThan(gridColumnsNode)
              .and(row.greaterThan(0)),
            () => {
              addLambdaCorrection(
                index.sub(gridColumnsNode.sub(1)),
                index.sub(gridColumnsNode.sub(1)),
                3,
              );
            },
          );
          (If)(
            column
              .greaterThan(0)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              addLambdaCorrection(
                index,
                index.add(gridColumnsNode.sub(1)),
                3,
              );
            },
          );
          (If)(column.greaterThan(1), () => {
            addCurvatureCorrection(
              index.sub(1),
              index.sub(2),
              index,
              4,
              'next',
            );
          });
          (If)(
            column
              .greaterThan(0)
              .and(column.add(1).lessThan(gridColumnsNode)),
            () => {
              addCurvatureCorrection(
                index,
                index.sub(1),
                index.add(1),
                4,
                'center',
              );
            },
          );
          (If)(
            column.add(2).lessThan(gridColumnsNode),
            () => {
              addCurvatureCorrection(
                index.add(1),
                index,
                index.add(2),
                4,
                'previous',
              );
            },
          );
          (If)(row.greaterThan(1), () => {
            addCurvatureCorrection(
              index.sub(gridColumnsNode),
              index.sub(gridColumnsNode.mul(2)),
              index,
              5,
              'next',
            );
          });
          (If)(
            row
              .greaterThan(0)
              .and(row.add(1).lessThan(gridRowsNode)),
            () => {
              addCurvatureCorrection(
                index,
                index.sub(gridColumnsNode),
                index.add(gridColumnsNode),
                5,
                'center',
              );
            },
          );
          (If)(
            row.add(2).lessThan(gridRowsNode),
            () => {
              addCurvatureCorrection(
                index.add(gridColumnsNode),
                index,
                index.add(gridColumnsNode.mul(2)),
                5,
                'previous',
              );
            },
          );

          const averagedCorrection = correction.div(
            correctionWeight.max(1),
          );
          const correctionLength = averagedCorrection.length();
          const limitedCorrection = averagedCorrection.mul(
            (float)(0.008).div(correctionLength.max(0.008)),
          );
          targetStorage
            .element(index)
            .assign(
              (vec4)(
                current.add(limitedCorrection),
                inverseMass,
              ),
            );
        });
      });
    })().compute(LIVING_FLOWER_MAXIMUM_PARTICLES);
  }

  const lambdaB = createLambdaPass(positionBStorage);
  const lambdaA = createLambdaPass(positionAStorage);
  const constraintBToA = createConstraintPass(
    positionBStorage,
    positionAStorage,
  );
  const constraintAToB = createConstraintPass(
    positionAStorage,
    positionBStorage,
  );
  const constraintPasses = Array.from(
    { length: LIVING_FLOWER.constraintIterations },
    (_, iteration) =>
      iteration % 2 === 0
        ? [lambdaB, constraintBToA]
        : [lambdaA, constraintAToB],
  ).flat();
  const collisionNode = (Fn)(() => {
    const index = instanceIndex;
    (If)(index.lessThan(activeRenderParticleCountNode), () => {
      const renderGridIndex = index.mod(renderVertexCountNode);
      const column = renderGridIndex.mod(renderColumnsNode);
      const row = renderGridIndex.div(renderColumnsNode);
      const petalIndex = index.div(renderVertexCountNode);

      const renderPositionAt = (
        targetPetal,
        renderColumn,
        renderRow,
      ) => {
        const renderIndex = targetPetal
          .mul(renderVertexCountNode)
          .add(renderRow.mul(renderColumnsNode))
          .add(renderColumn);
        const base =
          renderRestPositionStorage.element(renderIndex).xyz;
        const lowerCageRow = renderRow
          .div(2)
          .min(gridRowsNode.sub(1));
        const upperCageRow = lowerCageRow
          .add(1)
          .min(gridRowsNode.sub(1));
        const cagePetalOffset = targetPetal.mul(
          gridVertexCountNode,
        );
        const lowerCageIndex = cagePetalOffset
          .add(lowerCageRow.mul(gridColumnsNode))
          .add(renderColumn);
        const upperCageIndex = cagePetalOffset
          .add(upperCageRow.mul(gridColumnsNode))
          .add(renderColumn);
        const lowerDelta = positionBStorage
          .element(lowerCageIndex)
          .xyz
          .sub(
            restPositionStorage.element(lowerCageIndex).xyz,
          );
        const upperDelta = positionBStorage
          .element(upperCageIndex)
          .xyz
          .sub(
            restPositionStorage.element(upperCageIndex).xyz,
          );
        const amount = renderRow
          .sub(lowerCageRow.mul(2))
          .toFloat()
          .mul(0.5);
        return base.add(lowerDelta.mix(upperDelta, amount));
      };

      const samplePosition = renderPositionAt(
        petalIndex,
        column,
        row,
      );
      const collisionCorrection = (vec3)(0).toVar();
      (Loop)(
        {
          name: 'collisionCandidate',
          start: (uint)(0),
          end: (uint)(
            LIVING_FLOWER.maximumCollisionCandidates,
          ),
          type: 'uint',
          condition: '<',
        },
        ({ collisionCandidate }) => {
          const candidateData = collisionCandidateStorage.element(
            index
              .mul(
                (uint)(
                  LIVING_FLOWER.maximumCollisionCandidates,
                ),
              )
              .add(collisionCandidate),
          );
          (If)(candidateData.x.abs().greaterThan(0.5), () => {
            const side = candidateData.x
              .greaterThan(0)
              .select(1, -1);
            const candidate = candidateData.x
              .abs()
              .toUint()
              .sub(1);
            const targetPetal = candidate.div(
              (uint)(
                LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT,
              ),
            );
            const localTriangle = candidate.mod(
              (uint)(
                LIVING_FLOWER_MAXIMUM_RENDER_TRIANGLE_COUNT,
              ),
            );
            const referenceCell = localTriangle.div(2);
            const referenceColumn = referenceCell.mod(
              renderColumnsNode.sub(1),
            );
            const referenceRow = referenceCell.div(
              renderColumnsNode.sub(1),
            );
            const bestPenetration = (float)(0).toVar();
            const bestCorrection = (vec3)(0).toVar();

            const testTriangle = (
              aColumn,
              aRow,
              bColumn,
              bRow,
              cColumn,
              cRow,
            ) => {
              const a = renderPositionAt(
                targetPetal,
                aColumn,
                aRow,
              );
              const b = renderPositionAt(
                targetPetal,
                bColumn,
                bRow,
              );
              const c = renderPositionAt(
                targetPetal,
                cColumn,
                cRow,
              );
              const edge0 = b.sub(a);
              const edge1 = c.sub(a);
              const crossed = edge0.cross(edge1);
              const normalLength = crossed.length();
              (If)(normalLength.greaterThan(0.000001), () => {
                const normal = crossed.div(normalLength);
                const fromA = samplePosition.sub(a);
                const signedDistance = fromA
                  .dot(normal)
                  .mul(side);
                const d00 = edge0.dot(edge0);
                const d01 = edge0.dot(edge1);
                const d11 = edge1.dot(edge1);
                const d20 = fromA.dot(edge0);
                const d21 = fromA.dot(edge1);
                const denominator = d00
                  .mul(d11)
                  .sub(d01.mul(d01));
                (If)(
                  denominator.abs().greaterThan(0.0000001),
                  () => {
                    const barycentricV = d11
                      .mul(d20)
                      .sub(d01.mul(d21))
                      .div(denominator);
                    const barycentricW = d00
                      .mul(d21)
                      .sub(d01.mul(d20))
                      .div(denominator);
                    const barycentricU = barycentricV
                      .add(barycentricW)
                      .oneMinus();
                    const inside = barycentricU
                      .greaterThanEqual(-0.02)
                      .and(
                        barycentricV.greaterThanEqual(-0.02),
                      )
                      .and(
                        barycentricW.greaterThanEqual(-0.02),
                      );
                    const penetration = candidateData.w
                      .sub(signedDistance)
                      .max(0);
                    (If)(
                      inside.and(
                        penetration.greaterThan(
                          bestPenetration,
                        ),
                      ),
                      () => {
                        bestPenetration.assign(penetration);
                        bestCorrection.assign(
                          normal.mul(side).mul(penetration),
                        );
                      },
                    );
                  },
                );
              });
            };

            (Loop)(
              {
                name: 'collisionNeighborY',
                start: (uint)(0),
                end: (uint)(
                  LIVING_FLOWER.collisionNeighborhoodCells * 2 +
                    1,
                ),
                type: 'uint',
                condition: '<',
              },
              ({ collisionNeighborY }) => {
                const cellRow = referenceRow
                  .toFloat()
                  .add(collisionNeighborY.toFloat())
                  .sub(
                    LIVING_FLOWER.collisionNeighborhoodCells,
                  )
                  .clamp(
                    0,
                    renderRowsNode.sub(2).toFloat(),
                  )
                  .toUint();
                (Loop)(
                  {
                    name: 'collisionNeighborX',
                    start: (uint)(0),
                    end: (uint)(
                      LIVING_FLOWER.collisionNeighborhoodCells *
                        2 +
                        1,
                    ),
                    type: 'uint',
                    condition: '<',
                  },
                  ({ collisionNeighborX }) => {
                    const cellColumn = referenceColumn
                      .toFloat()
                      .add(collisionNeighborX.toFloat())
                      .sub(
                        LIVING_FLOWER.collisionNeighborhoodCells,
                      )
                      .clamp(
                        0,
                        renderColumnsNode.sub(2).toFloat(),
                      )
                      .toUint();
                    const rightColumn = cellColumn.add(1);
                    const upperRow = cellRow.add(1);
                    testTriangle(
                      cellColumn,
                      cellRow,
                      rightColumn,
                      cellRow,
                      rightColumn,
                      upperRow,
                    );
                    testTriangle(
                      cellColumn,
                      cellRow,
                      rightColumn,
                      upperRow,
                      cellColumn,
                      upperRow,
                    );
                  },
                );
              },
            );
            collisionCorrection.addAssign(bestCorrection);
          });
        },
      );
      const correctionLength = collisionCorrection.length();
      const limitedCorrection = collisionCorrection.mul(
        (float)(LIVING_FLOWER.collisionCorrectionLimit).div(
          correctionLength.max(
            LIVING_FLOWER.collisionCorrectionLimit,
          ),
        ),
      );
      collisionCorrectionStorage
        .element(index)
        .assign((vec4)(limitedCorrection, 0));
    });
  })().compute(LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES);

  const finalizeNode = (Fn)(() => {
    const index = instanceIndex;
    (If)(index.lessThan(activeParticleCountNode), () => {
      const restData = restPositionStorage.element(index);
      const previous = positionAStorage.element(index).xyz;
      const solved = positionBStorage.element(index).xyz;
      const gridIndex = index.mod(
        gridVertexCountNode,
      );
      const column = gridIndex.mod(gridColumnsNode);
      const row = gridIndex.div(gridColumnsNode);
      (If)(restData.w.lessThanEqual(0), () => {
        positionAStorage.element(index).assign(restData);
        velocityStorage.element(index).assign((vec4)(0, 0, 0, 0));
      }).Else(() => {
        const petalIndex = index.div(gridVertexCountNode);
        const evenRenderRow = row.mul(2);
        const evenRenderIndex = petalIndex
          .mul(renderVertexCountNode)
          .add(evenRenderRow.mul(renderColumnsNode))
          .add(column);
        const collisionCorrection = collisionCorrectionStorage
          .element(evenRenderIndex)
          .xyz
          .toVar();
        (If)(
          evenRenderRow.add(1).lessThan(renderRowsNode),
          () => {
            collisionCorrection.addAssign(
              collisionCorrectionStorage
                .element(evenRenderIndex.add(renderColumnsNode))
                .xyz
                .mul(0.5),
            );
          },
        );
        (If)(evenRenderRow.greaterThan(0), () => {
          collisionCorrection.addAssign(
            collisionCorrectionStorage
              .element(evenRenderIndex.sub(renderColumnsNode))
              .xyz
              .mul(0.5),
          );
        });
        const collisionLength = collisionCorrection.length();
        const limitedCollisionCorrection =
          collisionCorrection.mul(
            (float)(LIVING_FLOWER.collisionCorrectionLimit).div(
              collisionLength.max(
                LIVING_FLOWER.collisionCorrectionLimit,
              ),
            ),
          );
        const collisionSolved = solved.add(
          limitedCollisionCorrection,
        );
        const maximumDisplacement = (float)(row)
          .div((float)(gridRowsNode.sub(1)))
          .mul(LIVING_FLOWER.maximumTipDisplacement);
        const restOffset = collisionSolved.sub(restData.xyz);
        const boundedSolved = restData.xyz.add(
          restOffset.mul(
            maximumDisplacement.div(
              restOffset.length().max(maximumDisplacement),
            ),
          ),
        );
        velocityStorage.element(index).assign(
          (vec4)(
            boundedSolved
              .sub(previous)
              .div(stepSecondsNode),
            0,
          ),
        );
        positionAStorage
          .element(index)
          .assign((vec4)(boundedSolved, restData.w));
      });
    });
  })().compute(LIVING_FLOWER_MAXIMUM_PARTICLES);

  const stepComputeNodes = [
    integrateNode,
    ...constraintPasses,
    collisionNode,
    finalizeNode,
  ];
  const computeNodes = [
    integrateNode,
    lambdaB,
    lambdaA,
    constraintBToA,
    constraintAToB,
    collisionNode,
    finalizeNode,
  ];

  function setActiveDispatchCounts(
    activeParticleCount,
    activeRenderParticleCount,
  ) {
    integrateNode.count = activeParticleCount;
    lambdaB.count = activeParticleCount;
    lambdaA.count = activeParticleCount;
    constraintBToA.count = activeParticleCount;
    constraintAToB.count = activeParticleCount;
    collisionNode.count = activeRenderParticleCount;
    finalizeNode.count = activeParticleCount;
  }
  const storageNodes = [
    positionAStorage,
    positionBStorage,
    restPositionStorage,
    renderRestPositionStorage,
    velocityStorage,
    constraintLambdaStorage,
    constraintDeltaStorage,
    collisionCandidateStorage,
    collisionCorrectionStorage,
  ];

  function dispose() {
    computeNodes.forEach((node) => node.dispose());
    storageNodes.forEach((node) => node.value.dispose());
    trajectoryGpu.dispose();
  }

  return {
    positionAStorage,
    positionBStorage,
    restPositionStorage,
    renderRestPositionStorage,
    velocityStorage,
    constraintLambdaStorage,
    constraintDeltaStorage,
    collisionCandidateStorage,
    collisionCorrectionStorage,
    trajectoryGpu,
    activePetalCountNode,
    gridColumnsNode,
    gridRowsNode,
    gridVertexCountNode,
    gridCellCountNode,
    renderColumnsNode,
    renderRowsNode,
    renderVertexCountNode,
    simulationTimeNode,
    stepSecondsNode,
    turbulenceStrengthNode,
    turbulenceScaleNode,
    flowerRadiusNode,
    turbulenceSpeedNode,
    interactionForceNode,
    interactionRadiusNode,
    interactionReadinessNode,
    interactionMinimumOutnessNode,
    stepComputeNodes,
    setActiveDispatchCounts,
    dispose,
  };
}
