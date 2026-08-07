import {
  Fn,
  If,
  Loop,
  cos,
  exp,
  float,
  instanceIndex,
  sin,
  smoothstep,
  uint,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { FLOWER_INTRO } from './flower-intro-contract';
import { transformFlowerStageThreePosition } from './flower-stage-three-tsl';
import { LIVING_FLOWER } from '../simulation/living-flower-contract';

export function createFlowerParticleComputeGraph(dependencies) {
  const {
    config,
    simulation,
    positionAgeStorage,
    velocityLifetimeStorage,
    appearanceStorage,
    connectionAnchorStorage,
    interactionEventStorage,
    anchorMetadataStorage,
    introStartPositionStorage,
    deltaSecondsNode,
    elapsedSecondsNode,
    emissionElapsedSecondsNode,
    resetNode,
    introSpawnStartNode,
    introSpawnCountNode,
    introSpawnSequenceNode,
    stageThreeProgressNode,
    stageThreeSpreadProgressNode,
    stageThreeReturnActiveNode,
    stageThreeReturnProgressNode,
    stageThreeReturnStartProgressNode,
    stageThreeSpawnStartNode,
    stageThreeSpawnCountNode,
    stageThreeSpawnSequenceNode,
    stageThreeAttractorNode,
    interactionSpawnStartNode,
    interactionEventCountNode,
    interactionSpawnSequenceNode,
    interactionSampleCountNode,
    localToClipNode,
    clipToLocalNode,
    interactionCssSizeNode,
  } = dependencies;
  const maximumParticles = config.maximumParticles;

  const random = (seed, channel) => {
    const state = seed
      .add(uint((channel * 0x9e3779b1) >>> 0))
      .mul(uint(747796405))
      .add(uint(2891336453));
    const word = state
      .shiftRight(state.shiftRight(28).add(4))
      .bitXor(state)
      .mul(uint(277803737));
    return word
      .shiftRight(22)
      .bitXor(word)
      .toFloat()
      .mul(1 / 2 ** 32);
  };

  const clearParticle = (slot) => {
    positionAgeStorage.element(slot).assign(vec4(0));
    velocityLifetimeStorage.element(slot).assign(vec4(0));
    appearanceStorage.element(slot).assign(vec4(0));
  };

  const restVertexPosition = (petal, column, row) => {
    const absoluteVertex = petal
      .mul(simulation.compute.renderVertexCountNode)
      .add(row.mul(simulation.compute.renderColumnsNode))
      .add(column);
    return simulation.compute.renderRestPositionStorage
      .element(absoluteVertex)
      .xyz;
  };

  const transformStageThreePosition = (petal, position, rootPosition) => {
    const outness = anchorMetadataStorage
      .element(petal)
      .x
      .clamp(0, 1);
    const spreadRootPosition = restVertexPosition(
      petal,
      simulation.compute.renderColumnsNode.sub(1).div(2),
      simulation.compute.renderRowsNode.mul(0),
    );
    return transformFlowerStageThreePosition({
      petal,
      position,
      rootPosition,
      spreadRootPosition,
      outness,
      activePetalCount: simulation.compute.activePetalCountNode,
      progress: stageThreeProgressNode,
      spreadProgress: stageThreeSpreadProgressNode,
      returnActive: stageThreeReturnActiveNode,
      returnProgress: stageThreeReturnProgressNode,
      returnStartProgress: stageThreeReturnStartProgressNode,
    });
  };

  const stageThreePosition = (petal, position) =>
    transformStageThreePosition(
      petal,
      position,
      simulation.directPetalRootPosition(petal),
    );

  const integrateParticle = (slot) => {
    const positionAge = positionAgeStorage.element(slot);
    const velocityLifetime = velocityLifetimeStorage.element(slot);
    const appearance = appearanceStorage.element(slot);
    const lifetime = velocityLifetime.w;
    If(lifetime.greaterThan(0), () => {
      const age = positionAge.w.add(deltaSecondsNode).toVar();
      If(age.greaterThanEqual(lifetime), () => {
        clearParticle(slot);
      }).Else(() => {
        const position = positionAge.xyz.toVar();
        const velocity = velocityLifetime.xyz.toVar();
        const frequency = float(config.curlSpatialFrequency);
        const curlX = sin(
          position.y.mul(frequency).add(elapsedSecondsNode.mul(0.6)),
        )
          .negate()
          .sub(
            cos(
              position.z
                .mul(frequency)
                .add(elapsedSecondsNode.mul(0.5)),
            ),
          );
        const curlY = sin(
          position.z.mul(frequency).sub(elapsedSecondsNode.mul(0.3)),
        )
          .negate()
          .sub(
            cos(
              position.x
                .mul(frequency)
                .sub(elapsedSecondsNode.mul(0.4)),
            ),
          );
        const curlZ = sin(
          position.x.mul(frequency).add(elapsedSecondsNode.mul(0.2)),
        )
          .negate()
          .sub(
            cos(
              position.y
                .mul(frequency)
                .add(elapsedSecondsNode.mul(0.7)),
            ),
          );
        const drag = exp(
          deltaSecondsNode.mul(-config.velocityDragPerSecond),
        );
        const particleClip = localToClipNode
          .mul(vec4(position, 1))
          .toVar();
        const particleScreenUv = particleClip.xy
          .div(particleClip.w)
          .mul(0.5)
          .add(0.5);
        const attractionScreenDelta = stageThreeAttractorNode.xy
          .sub(particleScreenUv);
        const attractionDistance = attractionScreenDelta
          .mul(interactionCssSizeNode)
          .length()
          .toVar();
        const pointerNdc = stageThreeAttractorNode.xy.mul(2).sub(1);
        const pointerAtParticleDepth = clipToLocalNode
          .mul(
            vec4(
              pointerNdc.mul(particleClip.w),
              particleClip.z,
              particleClip.w,
            ),
          );
        const attractionDelta = pointerAtParticleDepth.xy
          .div(pointerAtParticleDepth.w.max(0.0001))
          .sub(position.xy)
          .toVar();
        const attractionDirection = attractionDelta.div(
          attractionDelta.length().max(0.0001),
        );
        const attractionFalloff = smoothstep(
          0,
          1,
          float(1)
            .sub(
              attractionDistance.div(
                config.stageThreeAttractionRadiusCssPixels,
              ),
            )
            .clamp(0, 1),
        ).mul(stageThreeAttractorNode.z);
        const attractionAcceleration = attractionDirection
          .mul(config.stageThreeAttractionAcceleration)
          .mul(attractionFalloff);
        velocity.assign(
          velocity
            .add(
              vec3(
                curlX.mul(config.curlAcceleration),
                float(config.upwardAcceleration).add(
                  curlY.mul(config.curlAcceleration * 0.62),
                ),
                curlZ.mul(config.curlAcceleration),
              ).mul(deltaSecondsNode),
            )
            .add(
              vec3(attractionAcceleration, 0).mul(deltaSecondsNode),
            )
            .mul(drag),
        );
        position.addAssign(velocity.mul(deltaSecondsNode));
        const remaining = float(1).sub(age.div(lifetime));
        const deathScale = smoothstep(
          0,
          1,
          remaining.div(config.deathShrinkFraction).clamp(0, 1),
        );
        const opacity = smoothstep(
          0,
          1,
          age.div(0.08).clamp(0, 1),
        ).mul(deathScale);
        positionAge.assign(vec4(position, age));
        velocityLifetime.assign(vec4(velocity, lifetime));
        appearance.assign(
          vec4(
            appearance.x,
            opacity,
            appearance.zw,
          ),
        );
      });
    });
  };

  const clearOrIntegrate = (slot) => {
    If(resetNode.greaterThan(0), () => {
      clearParticle(slot);
    }).Else(() => {
      integrateParticle(slot);
    });
  };

  const writeConnectionAnchors = (
    slot,
    petal,
    left,
    right,
    lower,
    upper,
    seed,
  ) => {
    for (
      let connection = 0;
      connection < config.connectionsPerParticle;
      connection += 1
    ) {
      const targetColumn = connection % 2 === 0 ? left : right;
      const targetRow = connection < 2 ? lower : upper;
      const breakDistance = random(seed, 12 + connection)
        .mul(
          config.maximumConnectionBreakDistance -
            config.minimumConnectionBreakDistance,
        )
        .add(config.minimumConnectionBreakDistance);
      connectionAnchorStorage
        .element(
          slot
            .mul(uint(config.connectionsPerParticle))
            .add(uint(connection)),
        )
        .assign(
          vec4(
            float(petal),
            float(targetColumn),
            float(targetRow),
            breakDistance,
          ),
        );
    }
  };

  const spawnParticle = ({
    slot,
    source,
    petal,
    left,
    right,
    lower,
    upper,
    seed,
    fanOut,
    stageThreeFanOut,
    sizeMultiplier,
  }) => {
    const lifetime = random(seed, 8)
      .mul(
        config.maximumLifetimeSeconds -
          config.minimumLifetimeSeconds,
      )
      .add(config.minimumLifetimeSeconds);
    const baseSize = random(seed, 9)
      .mul(config.maximumSize - config.minimumSize)
      .add(config.minimumSize)
      .mul(sizeMultiplier);
    let velocity;
    if (stageThreeFanOut) {
      const angle = random(seed, 5).mul(Math.PI * 2);
      const upwardDirection = random(seed, 6)
        .mul(
          config.stageThreeMaximumUpwardDirection -
            config.stageThreeMinimumUpwardDirection,
        )
        .add(config.stageThreeMinimumUpwardDirection);
      const lateralDirection = float(1)
        .sub(upwardDirection.mul(upwardDirection))
        .max(0)
        .sqrt();
      const speed = random(seed, 7)
        .mul(
          config.maximumInitialUpwardVelocity -
            config.minimumInitialUpwardVelocity,
        )
        .add(config.minimumInitialUpwardVelocity);
      velocity = vec3(
        cos(angle).mul(lateralDirection),
        upwardDirection,
        sin(angle).mul(lateralDirection),
      ).mul(speed);
    } else if (fanOut) {
      const angle = random(seed, 5).mul(Math.PI * 2);
      const radial = random(seed, 6)
        .mul(
          config.maximumInteractionRadialVelocity -
            config.minimumInteractionRadialVelocity,
        )
        .add(config.minimumInteractionRadialVelocity);
      velocity = vec3(
        cos(angle).mul(radial),
        random(seed, 7)
          .mul(
            config.maximumInteractionUpwardVelocity -
              config.minimumInteractionUpwardVelocity,
          )
          .add(config.minimumInteractionUpwardVelocity),
        sin(angle).mul(radial),
      );
    } else {
      velocity = vec3(
        random(seed, 5).sub(0.5).mul(0.035),
        random(seed, 6)
          .mul(
            config.maximumInitialUpwardVelocity -
              config.minimumInitialUpwardVelocity,
          )
          .add(config.minimumInitialUpwardVelocity),
        random(seed, 7).sub(0.5).mul(0.035),
      );
    }
    positionAgeStorage.element(slot).assign(vec4(source, 0));
    velocityLifetimeStorage
      .element(slot)
      .assign(vec4(velocity, lifetime));
    appearanceStorage
      .element(slot)
      .assign(
        vec4(
          baseSize,
          0,
          random(seed, 10),
          random(seed, 11),
        ),
      );
    writeConnectionAnchors(
      slot,
      petal,
      left,
      right,
      lower,
      upper,
      seed,
    );
  };

  const spawnIntroParticle = (slot, eventIndex) => {
    const seed = introSpawnSequenceNode.add(eventIndex);
    const activeAnchorCount = uint(0).toVar();
    Loop(
      {
        name: 'introActiveAnchor',
        start: uint(0),
        end: simulation.compute.activePetalCountNode,
        type: 'uint',
        condition: '<',
      },
      ({ introActiveAnchor }) => {
        const outness = anchorMetadataStorage
          .element(introActiveAnchor)
          .x;
        const startSeconds = float(FLOWER_INTRO.emptyLeadSeconds).add(
          float(FLOWER_INTRO.petalOrderSpanSeconds).mul(
            float(1)
              .sub(outness.clamp(0, 1))
              .pow(FLOWER_INTRO.orderExponent),
          ),
        );
        const front = emissionElapsedSecondsNode
          .sub(startSeconds)
          .div(FLOWER_INTRO.rootToTipSweepSeconds);
        If(
          front
            .greaterThanEqual(0)
            .and(front.lessThanEqual(1)),
          () => {
            activeAnchorCount.addAssign(1);
          },
        );
      },
    );
    If(activeAnchorCount.greaterThan(0), () => {
      const selectedOrdinal = random(seed, 0)
        .mul(float(activeAnchorCount))
        .floor()
        .toUint()
        .min(activeAnchorCount.sub(1));
      const selectedPetal = uint(0).toVar();
      const selectedFront = float(0).toVar();
      const seen = uint(0).toVar();
      Loop(
        {
          name: 'introSelectAnchor',
          start: uint(0),
          end: simulation.compute.activePetalCountNode,
          type: 'uint',
          condition: '<',
        },
        ({ introSelectAnchor }) => {
          const outness = anchorMetadataStorage
            .element(introSelectAnchor)
            .x;
          const startSeconds = float(FLOWER_INTRO.emptyLeadSeconds).add(
            float(FLOWER_INTRO.petalOrderSpanSeconds).mul(
              float(1)
                .sub(outness.clamp(0, 1))
                .pow(FLOWER_INTRO.orderExponent),
            ),
          );
          const front = emissionElapsedSecondsNode
            .sub(startSeconds)
            .div(FLOWER_INTRO.rootToTipSweepSeconds);
          const active = front
            .greaterThanEqual(0)
            .and(front.lessThanEqual(1));
          If(active, () => {
            If(seen.equal(selectedOrdinal), () => {
              selectedPetal.assign(introSelectAnchor);
              selectedFront.assign(front);
            });
            seen.addAssign(1);
          });
        },
      );
      const across = random(seed, 1).mul(
        float(simulation.compute.renderColumnsNode.sub(1)),
      );
      const along = selectedFront.clamp(0, 1).mul(
        float(simulation.compute.renderRowsNode.sub(1)),
      );
      const left = across.floor().toUint();
      const right = left
        .add(1)
        .min(simulation.compute.renderColumnsNode.sub(1));
      const lower = along.floor().toUint();
      const upper = lower
        .add(1)
        .min(simulation.compute.renderRowsNode.sub(1));
      const acrossMix = across.sub(float(left));
      const alongMix = along.sub(float(lower));
      const absoluteVertex = (column, row) =>
        selectedPetal
          .mul(simulation.compute.renderVertexCountNode)
          .add(row.mul(simulation.compute.renderColumnsNode))
          .add(column);
      const sampleRest = (column, row) =>
        simulation.compute.renderRestPositionStorage
          .element(absoluteVertex(column, row))
          .xyz;
      const sampleIntroStart = (column, row) =>
        introStartPositionStorage
          .element(absoluteVertex(column, row))
          .xyz;
      const lerp = (from, to, amount) =>
        from.mul(float(1).sub(amount)).add(to.mul(amount));
      const bilinear = (sample) => {
        const lowerPosition = lerp(
          sample(left, lower),
          sample(right, lower),
          acrossMix,
        );
        const upperPosition = lerp(
          sample(left, upper),
          sample(right, upper),
          acrossMix,
        );
        return lerp(lowerPosition, upperPosition, alongMix);
      };
      const restPosition = bilinear(sampleRest);
      const introStartPosition = bilinear(sampleIntroStart);
      const curvinessFactor = smoothstep(
        0,
        FLOWER_INTRO.curvinessBlendSeconds,
        selectedFront.mul(FLOWER_INTRO.rootToTipSweepSeconds),
      );
      const basisY = anchorMetadataStorage
        .element(selectedPetal)
        .yzw;
      const source = lerp(
        introStartPosition,
        restPosition,
        curvinessFactor,
      )
        .add(basisY.mul(FLOWER_INTRO.leadingEdgeStretchPetalUnits))
        .add(
          vec3(
            random(seed, 2).sub(0.5),
            random(seed, 3).sub(0.5),
            random(seed, 4).sub(0.5),
          ).mul(0.012),
        );
      spawnParticle({
        slot,
        source,
        petal: selectedPetal,
        left,
        right,
        lower,
        upper,
        seed,
        fanOut: false,
        stageThreeFanOut: false,
        sizeMultiplier: 1,
      });
    }).Else(() => {
      clearOrIntegrate(slot);
    });
  };

  const spawnStageThreeParticle = (slot, eventIndex) => {
    If(simulation.compute.activePetalCountNode.greaterThan(0), () => {
      const seed = stageThreeSpawnSequenceNode.add(eventIndex);
      const selectedPetal = seed.mod(
        simulation.compute.activePetalCountNode,
      );
      const column = seed
        .div(simulation.compute.activePetalCountNode)
        .mod(simulation.compute.renderColumnsNode);
      const row = simulation.compute.renderRowsNode.sub(1);
      const rimPosition = restVertexPosition(
        selectedPetal,
        column,
        row,
      );
      const rootPosition = restVertexPosition(
        selectedPetal,
        simulation.compute.renderColumnsNode.sub(1).div(2),
        uint(0),
      );
      const source = transformStageThreePosition(
        selectedPetal,
        rimPosition,
        rootPosition,
      );
      spawnParticle({
        slot,
        source,
        petal: selectedPetal,
        left: column,
        right: column,
        lower: row,
        upper: row,
        seed,
        fanOut: false,
        stageThreeFanOut: true,
        sizeMultiplier: config.stageThreeSizeMultiplier,
      });
    }).Else(() => {
      clearOrIntegrate(slot);
    });
  };

  const writeInteractionEvent = (
    sampleIndex,
    rank,
    distance,
    absoluteVertex,
    radiusSquared,
  ) => {
    const eventIndex = sampleIndex
      .mul(uint(config.interactionVerticesPerSample))
      .add(uint(rank));
    If(distance.lessThanEqual(radiusSquared), () => {
      const petal = absoluteVertex.div(
        simulation.compute.renderVertexCountNode,
      );
      const vertex = absoluteVertex.mod(
        simulation.compute.renderVertexCountNode,
      );
      const column = vertex.mod(simulation.compute.renderColumnsNode);
      const row = vertex.div(simulation.compute.renderColumnsNode);
      const position = simulation.compute.renderRestPositionStorage
        .element(absoluteVertex)
        .xyz;
      interactionEventStorage
        .element(eventIndex.mul(2))
        .assign(vec4(position, 1));
      interactionEventStorage
        .element(eventIndex.mul(2).add(1))
        .assign(
          vec4(
            float(petal),
            float(column),
            float(row),
            0,
          ),
        );
    }).Else(() => {
      interactionEventStorage
        .element(eventIndex.mul(2))
        .assign(vec4(0));
      interactionEventStorage
        .element(eventIndex.mul(2).add(1))
        .assign(vec4(0));
    });
  };

  const interactionSourceNode = Fn(() => {
    const sampleIndex = instanceIndex;
    If(sampleIndex.lessThan(interactionSampleCountNode), () => {
      const rayOffset = sampleIndex.mul(2);
      const screenUv = vec2(
        simulation.trajectoryGpu.rayStorage.element(rayOffset).w,
        simulation.trajectoryGpu.rayStorage
          .element(rayOffset.add(1))
          .w,
      );
      const radiusSquared = float(
        config.interactionSourceRadiusCssPixels *
          config.interactionSourceRadiusCssPixels,
      );
      const missingDistance = radiusSquared.add(1);
      const bestDistance0 = missingDistance.toVar();
      const bestDistance1 = missingDistance.toVar();
      const bestDistance2 = missingDistance.toVar();
      const bestDistance3 = missingDistance.toVar();
      const bestVertex0 = uint(0).toVar();
      const bestVertex1 = uint(0).toVar();
      const bestVertex2 = uint(0).toVar();
      const bestVertex3 = uint(0).toVar();
      Loop(
        {
          name: 'interactionPetal',
          start: uint(0),
          end: simulation.compute.activePetalCountNode,
          type: 'uint',
          condition: '<',
        },
        ({ interactionPetal }) => {
          Loop(
            {
              name: 'interactionVertex',
              start: uint(0),
              end: simulation.compute.renderVertexCountNode,
              type: 'uint',
              condition: '<',
            },
            ({ interactionVertex }) => {
              const absoluteVertex = interactionPetal
                .mul(simulation.compute.renderVertexCountNode)
                .add(interactionVertex);
              const position = simulation.compute.renderRestPositionStorage
                .element(absoluteVertex)
                .xyz;
              const clip = localToClipNode.mul(vec4(position, 1));
              If(clip.w.greaterThan(0), () => {
                const projected = clip.xy
                  .div(clip.w)
                  .mul(0.5)
                  .add(0.5);
                const inside = projected.x
                  .greaterThanEqual(0)
                  .and(projected.x.lessThanEqual(1))
                  .and(projected.y.greaterThanEqual(0))
                  .and(projected.y.lessThanEqual(1));
                If(inside, () => {
                  const pixelDelta = projected
                    .sub(screenUv)
                    .mul(interactionCssSizeNode);
                  const distance = pixelDelta.dot(pixelDelta);
                  If(distance.lessThan(bestDistance3), () => {
                    If(distance.lessThan(bestDistance0), () => {
                      bestDistance3.assign(bestDistance2);
                      bestVertex3.assign(bestVertex2);
                      bestDistance2.assign(bestDistance1);
                      bestVertex2.assign(bestVertex1);
                      bestDistance1.assign(bestDistance0);
                      bestVertex1.assign(bestVertex0);
                      bestDistance0.assign(distance);
                      bestVertex0.assign(absoluteVertex);
                    }).ElseIf(distance.lessThan(bestDistance1), () => {
                      bestDistance3.assign(bestDistance2);
                      bestVertex3.assign(bestVertex2);
                      bestDistance2.assign(bestDistance1);
                      bestVertex2.assign(bestVertex1);
                      bestDistance1.assign(distance);
                      bestVertex1.assign(absoluteVertex);
                    }).ElseIf(distance.lessThan(bestDistance2), () => {
                      bestDistance3.assign(bestDistance2);
                      bestVertex3.assign(bestVertex2);
                      bestDistance2.assign(distance);
                      bestVertex2.assign(absoluteVertex);
                    }).Else(() => {
                      bestDistance3.assign(distance);
                      bestVertex3.assign(absoluteVertex);
                    });
                  });
                });
              });
            },
          );
        },
      );
      writeInteractionEvent(
        sampleIndex,
        0,
        bestDistance0,
        bestVertex0,
        radiusSquared,
      );
      writeInteractionEvent(
        sampleIndex,
        1,
        bestDistance1,
        bestVertex1,
        radiusSquared,
      );
      writeInteractionEvent(
        sampleIndex,
        2,
        bestDistance2,
        bestVertex2,
        radiusSquared,
      );
      writeInteractionEvent(
        sampleIndex,
        3,
        bestDistance3,
        bestVertex3,
        radiusSquared,
      );
    });
  })().compute(LIVING_FLOWER.maximumBrushSamples);

  const lifecycleNode = Fn(() => {
    const slot = instanceIndex;
    const interactionDistance = slot
      .add(uint(maximumParticles))
      .sub(interactionSpawnStartNode)
      .mod(uint(maximumParticles));
    const introDistance = slot
      .add(uint(maximumParticles))
      .sub(introSpawnStartNode)
      .mod(uint(maximumParticles));
    const stageThreeDistance = slot
      .add(uint(maximumParticles))
      .sub(stageThreeSpawnStartNode)
      .mod(uint(maximumParticles));
    If(interactionDistance.lessThan(interactionEventCountNode), () => {
      const event = interactionEventStorage.element(
        interactionDistance.mul(2),
      );
      If(event.w.greaterThan(0), () => {
        const metadata = interactionEventStorage.element(
          interactionDistance.mul(2).add(1),
        );
        const petal = metadata.x.toUint();
        const column = metadata.y.toUint();
        const row = metadata.z.toUint();
        spawnParticle({
          slot,
          source: event.xyz,
          petal,
          left: column,
          right: column,
          lower: row,
          upper: row,
          seed: interactionSpawnSequenceNode.add(interactionDistance),
          fanOut: true,
          stageThreeFanOut: false,
          sizeMultiplier: 1,
        });
      }).Else(() => {
        clearOrIntegrate(slot);
      });
    }).ElseIf(
      stageThreeDistance.lessThan(stageThreeSpawnCountNode),
      () => {
        spawnStageThreeParticle(slot, stageThreeDistance);
      },
    ).ElseIf(introDistance.lessThan(introSpawnCountNode), () => {
      spawnIntroParticle(slot, introDistance);
    }).Else(() => {
      clearOrIntegrate(slot);
    });
  })().compute(maximumParticles);

  return {
    interactionSourceNode,
    lifecycleNode,
    stageThreePosition,
  };
}
