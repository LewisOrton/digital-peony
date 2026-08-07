import * as THREE from 'three/webgpu';
import {
  float,
  mix,
  sin,
  smoothstep,
  uniform,
  uint,
  uv,
  vec2,
  vec3,
  vertexIndex,
} from 'three/tsl';
import {
  FLOWER_PARTICLES,
  flowerIntroBilinearPosition,
  flowerIntroLeadingEdgeBirthPosition,
  flowerIntroLeadingEdgeRootToTip,
  flowerParticleDeathScale,
  flowerParticleConnectionIntensity,
  flowerParticleRingSlot,
  flowerStageThreeEmissionStep,
  flowerStageThreeAttractionFalloff,
  flowerStageThreeInitialVelocity,
  flowerStageThreePetalIndex,
  flowerStageThreeParticleSize,
  flowerStageThreeRimVertex,
  selectNearestFlowerParticleVertices,
} from './flower-particle-contract';
import { createFlowerParticleGpu } from './flower-particle-gpu';
import { FLOWER_INTRO } from './flower-intro-contract';
import {
  deformFlowerPetalPointWithSignedCurvinessAndWrinkle,
  stableCreasePhase,
} from '../geometry/flower-mode';
import { PETAL_GEOMETRY } from '../geometry/geometry-contract';
import { sampleFlowerContactPalette } from './flower-contact-palette';

function markDynamic(attribute, componentCount) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, componentCount);
  attribute.needsUpdate = true;
}

export function createFlowerParticles({
  parent,
  geometryResource,
  simulation,
  instances,
  getAnchors,
}) {
  const config = FLOWER_PARTICLES;
  const maximumParticles = config.maximumParticles;
  const connectionCount =
    maximumParticles * config.connectionsPerParticle;
  const gpu = createFlowerParticleGpu(simulation);
  const contactPaletteNode = uniform(sampleFlowerContactPalette(0));

  const geometry = new THREE.PlaneGeometry(1, 1);
  const positionAgeNode = gpu.positionAgeStorage.toAttribute();
  const velocityLifetimeNode =
    gpu.velocityLifetimeStorage.toAttribute();
  const particleDataNode = gpu.appearanceStorage.toAttribute();
  const remainingLifetime = float(1).sub(
    positionAgeNode.w.div(velocityLifetimeNode.w.max(0.000001)),
  );
  const deathScaleNode = smoothstep(
    0,
    1,
    remainingLifetime
      .div(config.deathShrinkFraction)
      .clamp(0, 1),
  );
  const sizeNode = particleDataNode.x.mul(deathScaleNode);
  const opacityNode = particleDataNode.y;
  const seedNode = particleDataNode.z;
  const colorPhaseNode = particleDataNode.w;
  const local = uv().sub(0.5);
  const diamondDistance = local.x.abs().add(local.y.abs());
  const radialDistance = local.dot(local).sqrt();
  const core = diamondDistance
    .smoothstep(0.16, 0.5)
    .oneMinus();
  const halo = radialDistance
    .smoothstep(0.18, 0.7)
    .oneMinus()
    .mul(0.28);
  const flickerRate = seedNode.mul(24).add(24);
  const flickerSlice = gpu.elapsedSecondsNode.mul(flickerRate).floor();
  const flickerSeed = sin(
    flickerSlice
      .mul(91.731)
      .add(seedNode.mul(47.193)),
  )
    .mul(43758.5453)
    .fract();
  const flicker = flickerSeed.mul(0.72).add(0.28);
  const spark = smoothstep(0.9, 0.995, flickerSeed);
  const iceBlue = vec3(0.08, 0.58, 1.0);
  const blueWhite = vec3(0.72, 0.93, 1.0);
  const phaseMagenta = vec3(0.72, 0.16, 1.0);
  const baseColor = mix(
    iceBlue,
    blueWhite,
    colorPhaseNode.mul(0.68).add(0.18).clamp(0, 1),
  );
  const magentaAmount = smoothstep(0.84, 0.98, colorPhaseNode)
    .mul(0.42);
  const particleColor = mix(
    baseColor,
    phaseMagenta,
    magentaAmount,
  );
  const contactParticleColor = mix(
    particleColor,
    contactPaletteNode,
    0.86,
  ).add(blueWhite.mul(spark.mul(0.32)));
  const material = new THREE.SpriteNodeMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  material.positionNode = positionAgeNode.xyz;
  material.scaleNode = vec2(sizeNode, sizeNode.mul(0.58));
  material.rotationNode = seedNode
    .mul(Math.PI * 2)
    .add(
      gpu.elapsedSecondsNode.mul(seedNode.mul(0.8).add(0.18)),
    );
  material.colorNode = contactParticleColor;
  material.opacityNode = opacityNode
    .mul(core.add(halo).clamp(0, 1))
    .mul(flicker)
    .mul(spark.mul(0.32).add(1));

  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    maximumParticles,
  );
  mesh.name = 'Flower Intro Leading Edge Particles';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  const identity = new THREE.Matrix4();
  for (let slot = 0; slot < maximumParticles; slot += 1) {
    mesh.setMatrixAt(slot, identity);
  }
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);

  const connectionGeometry = new THREE.BufferGeometry();
  connectionGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array(connectionCount * 2 * 3),
      3,
    ),
  );
  connectionGeometry.setDrawRange(0, 0);
  const connectionOrdinal = vertexIndex.div(uint(2));
  const connectionSlot = connectionOrdinal.div(
    uint(config.connectionsPerParticle),
  );
  const connectionWithinParticle = connectionOrdinal.mod(
    uint(config.connectionsPerParticle),
  );
  const connectionAnchor = gpu.connectionAnchorStorage.element(
    connectionSlot
      .mul(uint(config.connectionsPerParticle))
      .add(connectionWithinParticle),
  );
  const connectionBaseTarget = simulation.directVertexPosition(
    connectionAnchor.x.toUint(),
    connectionAnchor.yz,
  );
  const connectionTarget = gpu.stageThreePosition(
    connectionAnchor.x.toUint(),
    connectionBaseTarget,
  );
  const connectionParticleState = gpu.positionAgeStorage.element(
    connectionSlot,
  );
  const connectionAppearance = gpu.appearanceStorage.element(
    connectionSlot,
  );
  const connectionParticlePosition = connectionParticleState.xyz;
  const connectionDistance = connectionParticlePosition
    .sub(connectionTarget)
    .length();
  const connectionFadeRatio = connectionAnchor.w
    .sub(connectionDistance)
    .div(connectionAnchor.w.mul(0.32))
    .clamp(0, 1);
  const connectionFade = connectionFadeRatio
    .mul(connectionFadeRatio)
    .mul(connectionFadeRatio.mul(-2).add(3));
  const connectionIntensity = connectionAppearance.y.mul(
    connectionFade,
  );
  const connectionPhase = connectionAppearance.w;
  const connectionMagenta = connectionPhase
    .sub(0.88)
    .div(0.12)
    .max(0)
    .mul(0.46);
  const connectionColor = vec3(
    float(0.12)
      .add(connectionPhase.mul(0.38))
      .add(connectionMagenta.mul(0.5)),
    float(0.62)
      .add(connectionPhase.mul(0.22))
      .sub(connectionMagenta.mul(0.4)),
    float(1).add(connectionMagenta.mul(0.18)),
  );
  const contactConnectionColor = mix(
    connectionColor,
    contactPaletteNode,
    0.9,
  );
  const connectionIsTarget = vertexIndex
    .bitAnd(uint(1))
    .greaterThan(uint(0));
  const connectionEndpointIsVisible = connectionIsTarget.and(
    connectionDistance.lessThan(connectionAnchor.w),
  );
  const connectionMaterial = new THREE.LineBasicNodeMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  connectionMaterial.positionNode = connectionEndpointIsVisible.select(
    connectionTarget,
    connectionParticlePosition,
  );
  connectionMaterial.colorNode = contactConnectionColor;
  connectionMaterial.opacityNode = connectionIntensity.mul(0.68);
  const connections = new THREE.LineSegments(
    connectionGeometry,
    connectionMaterial,
  );
  connections.name = 'Flower Intro Particle Connections';
  connections.frustumCulled = false;
  connections.renderOrder = 2;
  connections.visible = false;
  parent.add(connections);

  const instanceMatrix = new THREE.Matrix4();
  const instanceBasisY = new THREE.Vector3();
  const introStartSource = new THREE.Vector3();
  const introStartPosition = new THREE.Vector3();
  const localToClip = new THREE.Matrix4();
  const clipToLocal = new THREE.Matrix4();
  let emitting = false;
  let stageThreeActive = false;
  let emissionElapsedSeconds = 0;
  let emissionAccumulator = 0;
  let stageThreeEmissionAccumulator = 0;
  let previousTimestamp = null;
  let spawnCursor = 0;
  let spawnSequence = 0;
  let generation = 0;
  let drawSlotCount = 0;
  let activeUntilTimestamp = 0;
  let resetRequested = true;
  let dormant = true;
  let pendingInteractionSampleCount = 0;
  let lastInteractionRevision = -1;
  let disposed = false;

  function setDrawSlotCount(nextCount) {
    const boundedCount = Math.min(maximumParticles, nextCount);
    if (boundedCount === drawSlotCount) return;
    drawSlotCount = boundedCount;
    mesh.count = drawSlotCount;
    connectionGeometry.setDrawRange(
      0,
      drawSlotCount * config.connectionsPerParticle * 2,
    );
  }

  function resetAllocation() {
    spawnCursor = 0;
    setDrawSlotCount(0);
  }

  function allocateEvents(eventCount) {
    const boundedCount = Math.min(maximumParticles, eventCount);
    const start = spawnCursor;
    if (boundedCount === 0) return start;
    if (
      drawSlotCount < maximumParticles &&
      start + boundedCount < maximumParticles
    ) {
      setDrawSlotCount(
        Math.max(drawSlotCount, start + boundedCount),
      );
    } else {
      setDrawSlotCount(maximumParticles);
    }
    spawnCursor = (spawnCursor + boundedCount) % maximumParticles;
    return start;
  }

  function syncAnchors() {
    if (disposed) return;
    const anchors = getAnchors();
    const values = gpu.anchorMetadataStorage.value.array;
    const introStartPositions =
      gpu.introStartPositionStorage.value.array;
    const positionAttribute =
      geometryResource.geometry.getAttribute('position');
    const uvAttribute = geometryResource.geometry.getAttribute('uv');
    const shapeAttribute = geometryResource.geometry.getAttribute(
      PETAL_GEOMETRY.shapeCoordinate.attribute,
    );
    const {
      renderColumns,
      renderRows,
      vertexCount,
    } = geometryResource.topology;
    values.fill(0);
    introStartPositions.fill(0);
    for (const anchor of anchors) {
      instances.getMatrixAt(anchor.index, instanceMatrix);
      instanceBasisY.setFromMatrixColumn(instanceMatrix, 1);
      const offset = anchor.index * 4;
      values[offset] = anchor.outness;
      values[offset + 1] = instanceBasisY.x;
      values[offset + 2] = instanceBasisY.y;
      values[offset + 3] = instanceBasisY.z;
      const phase = stableCreasePhase(anchor.index);
      for (let row = 0; row < renderRows; row += 1) {
        for (let column = 0; column < renderColumns; column += 1) {
          const vertex = row * renderColumns + column;
          introStartSource.fromBufferAttribute(
            positionAttribute,
            vertex,
          );
          introStartPosition
            .copy(
              deformFlowerPetalPointWithSignedCurvinessAndWrinkle(
                introStartSource,
                uvAttribute.getX(vertex),
                shapeAttribute.getX(vertex),
                uvAttribute.getY(vertex),
                phase,
                FLOWER_INTRO.curvinessStart,
              ),
            )
            .applyMatrix4(instanceMatrix);
          const introOffset =
            (anchor.index * vertexCount + vertex) * 4;
          introStartPositions[introOffset] = introStartPosition.x;
          introStartPositions[introOffset + 1] = introStartPosition.y;
          introStartPositions[introOffset + 2] = introStartPosition.z;
          introStartPositions[introOffset + 3] = 1;
        }
      }
    }
    markDynamic(
      gpu.anchorMetadataStorage.value,
      values.length,
    );
    const introStartComponentCount =
      anchors.length * vertexCount * 4;
    markDynamic(
      gpu.introStartPositionStorage.value,
      introStartComponentCount,
    );
  }

  function clear() {
    emitting = false;
    stageThreeActive = false;
    emissionAccumulator = 0;
    stageThreeEmissionAccumulator = 0;
    setStageThreeProgress(0);
    previousTimestamp = null;
    lastInteractionRevision = -1;
    pendingInteractionSampleCount = 0;
    activeUntilTimestamp = 0;
    resetRequested = true;
    dormant = true;
    resetAllocation();
    mesh.visible = false;
    connections.visible = false;
    gpu.stageThreeAttractorNode.value.z = 0;
  }

  function begin() {
    clear();
    generation += 1;
    spawnSequence = (generation * 0x85ebca6b) >>> 0;
    emitting = true;
    emissionElapsedSeconds = 0;
    dormant = false;
  }

  function setEmissionElapsedSeconds(elapsedSeconds) {
    emissionElapsedSeconds = Math.max(0, elapsedSeconds);
  }

  function stopEmission() {
    emitting = false;
    emissionAccumulator = 0;
  }

  function setStageThreeProgress(progress, motion = null) {
    gpu.stageThreeProgressNode.value = Math.min(1, Math.max(0, progress));
    gpu.stageThreeSpreadProgressNode.value = Math.min(
      1,
      Math.max(0, motion?.spreadProgress ?? 0),
    );
    gpu.stageThreeReturnActiveNode.value =
      motion?.phase === 'returning' ? 1 : 0;
    gpu.stageThreeReturnProgressNode.value = Math.min(
      1,
      Math.max(0, motion?.returnProgress ?? 0),
    );
    gpu.stageThreeReturnStartProgressNode.value = Math.min(
      1,
      Math.max(0, motion?.returnStartProgress ?? 0),
    );
  }

  function setStageThreeActive(active) {
    if (stageThreeActive === active) return;
    stageThreeActive = active;
    if (!active) gpu.stageThreeAttractorNode.value.z = 0;
    stageThreeEmissionAccumulator = 0;
    if (active && dormant) {
      resetRequested = true;
      resetAllocation();
      dormant = false;
    }
  }

  function setStageThreePointer(
    screenUv,
    pointerInside,
    camera,
    cssWidth,
    cssHeight,
  ) {
    if (!stageThreeActive || !pointerInside) {
      gpu.stageThreeAttractorNode.value.z = 0;
      return;
    }
    parent.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    localToClip
      .multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      )
      .multiply(parent.matrixWorld);
    clipToLocal.copy(localToClip).invert();
    gpu.localToClipNode.value.copy(localToClip);
    gpu.clipToLocalNode.value.copy(clipToLocal);
    gpu.interactionCssSizeNode.value.set(cssWidth, cssHeight);
    gpu.stageThreeAttractorNode.value.set(screenUv.x, screenUv.y, 1);
  }

  function preparePrewarm() {
    const previousVisibility = {
      particle: mesh.visible,
      connection: connections.visible,
    };
    const previousDrawSlotCount = drawSlotCount;
    setDrawSlotCount(Math.max(drawSlotCount, 1));
    mesh.visible = true;
    connections.visible = true;
    return () => {
      setDrawSlotCount(previousDrawSlotCount);
      mesh.visible = previousVisibility.particle;
      connections.visible = previousVisibility.connection;
    };
  }

  async function prewarmInteraction(renderer) {
    gpu.interactionSampleCountNode.value = 0;
    renderer.compute(gpu.interactionSourceNode);
    await renderer.backend.device.queue.onSubmittedWorkDone();
  }

  function scheduleIntroEmission(deltaSeconds) {
    if (!emitting || deltaSeconds <= 0) return 0;
    const hasActiveAnchor = getAnchors().some((anchor) => {
      const front = flowerIntroLeadingEdgeRootToTip(
        emissionElapsedSeconds,
        anchor.outness,
      );
      return front >= 0 && front <= 1;
    });
    if (!hasActiveAnchor) {
      emissionAccumulator = 0;
      return 0;
    }
    emissionAccumulator += config.emissionRatePerSecond * deltaSeconds;
    const spawnCount = Math.floor(emissionAccumulator);
    emissionAccumulator -= spawnCount;
    return spawnCount;
  }

  function scheduleStageThreeEmission(deltaSeconds) {
    if (!stageThreeActive || deltaSeconds <= 0) return 0;
    const step = flowerStageThreeEmissionStep(
      stageThreeEmissionAccumulator,
      deltaSeconds,
    );
    stageThreeEmissionAccumulator = step.accumulator;
    return step.spawnCount;
  }

  function emitFromTrajectory(frame, camera) {
    if (
      disposed ||
      !frame.deposit ||
      !frame.held ||
      frame.readiness <= 0 ||
      frame.sampleCount <= 0 ||
      frame.validatedRevision !== frame.revision ||
      frame.revision === lastInteractionRevision
    ) {
      return;
    }
    lastInteractionRevision = frame.revision;
    if (dormant) {
      resetRequested = true;
      resetAllocation();
      dormant = false;
    }
    pendingInteractionSampleCount = Math.min(
      simulation.trajectoryGpu.sampleCountNode.value,
      frame.sampleCount,
    );
    parent.updateWorldMatrix(true, false);
    camera.updateWorldMatrix(true, false);
    localToClip
      .multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      )
      .multiply(parent.matrixWorld);
    gpu.localToClipNode.value.copy(localToClip);
    gpu.interactionCssSizeNode.value.set(
      frame.cssWidth,
      frame.cssHeight,
    );
  }

  function update(renderer, timestamp) {
    if (disposed) return;
    const deltaSeconds =
      previousTimestamp === null
        ? 0
        : Math.min(
            config.maximumDeltaSeconds,
            Math.max(0, (timestamp - previousTimestamp) / 1000),
          );
    previousTimestamp = timestamp;
    const introSpawnCount = scheduleIntroEmission(deltaSeconds);
    const stageThreeSpawnCount = scheduleStageThreeEmission(deltaSeconds);
    const interactionEventCount =
      pendingInteractionSampleCount *
      config.interactionVerticesPerSample;
    const introSpawnStart = allocateEvents(introSpawnCount);
    const stageThreeSpawnStart = allocateEvents(stageThreeSpawnCount);
    const interactionSpawnStart = allocateEvents(
      interactionEventCount,
    );
    const introSpawnSequence = spawnSequence;
    spawnSequence = (spawnSequence + introSpawnCount) >>> 0;
    const stageThreeSpawnSequence = spawnSequence;
    spawnSequence = (spawnSequence + stageThreeSpawnCount) >>> 0;
    const interactionSpawnSequence = spawnSequence;
    spawnSequence = (spawnSequence + interactionEventCount) >>> 0;

    if (
      introSpawnCount > 0 ||
      stageThreeSpawnCount > 0 ||
      interactionEventCount > 0
    ) {
      activeUntilTimestamp = Math.max(
        activeUntilTimestamp,
        timestamp + config.maximumLifetimeSeconds * 1000,
      );
      mesh.visible = drawSlotCount > 0;
      connections.visible = drawSlotCount > 0;
    }

    gpu.deltaSecondsNode.value = deltaSeconds;
    gpu.elapsedSecondsNode.value = timestamp / 1000;
    gpu.emissionElapsedSecondsNode.value = emissionElapsedSeconds;
    gpu.resetNode.value = resetRequested ? 1 : 0;
    gpu.introSpawnStartNode.value = introSpawnStart;
    gpu.introSpawnCountNode.value = introSpawnCount;
    gpu.introSpawnSequenceNode.value = introSpawnSequence;
    gpu.stageThreeSpawnStartNode.value = stageThreeSpawnStart;
    gpu.stageThreeSpawnCountNode.value = stageThreeSpawnCount;
    gpu.stageThreeSpawnSequenceNode.value = stageThreeSpawnSequence;
    gpu.interactionSpawnStartNode.value = interactionSpawnStart;
    gpu.interactionEventCountNode.value = interactionEventCount;
    gpu.interactionSpawnSequenceNode.value =
      interactionSpawnSequence;
    gpu.interactionSampleCountNode.value =
      pendingInteractionSampleCount;

    if (pendingInteractionSampleCount > 0) {
      renderer.compute(gpu.interactionSourceNode);
    }
    const needsLifecycleDispatch =
      resetRequested ||
      introSpawnCount > 0 ||
      stageThreeSpawnCount > 0 ||
      interactionEventCount > 0 ||
      timestamp < activeUntilTimestamp;
    if (needsLifecycleDispatch) {
      renderer.compute(gpu.lifecycleNode);
    }

    resetRequested = false;
    pendingInteractionSampleCount = 0;
    if (
      !emitting &&
      !stageThreeActive &&
      timestamp >= activeUntilTimestamp
    ) {
      mesh.visible = false;
      connections.visible = false;
      dormant = true;
    }
  }

  function setContactProgress(progress) {
    sampleFlowerContactPalette(progress, contactPaletteNode.value);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    mesh.removeFromParent();
    connections.removeFromParent();
    geometry.dispose();
    material.dispose();
    connectionGeometry.dispose();
    connectionMaterial.dispose();
    gpu.dispose();
  }

  return {
    setContactProgress,
    setStageThreeProgress,
    setStageThreeActive,
    setStageThreePointer,
    preparePrewarm,
    prewarmInteraction,
    begin,
    setEmissionElapsedSeconds,
    stopEmission,
    emitFromTrajectory,
    syncAnchors,
    clear,
    update,
    dispose,
  };
}
