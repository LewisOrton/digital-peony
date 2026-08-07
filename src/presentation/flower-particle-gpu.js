// Dynamic TSL graph construction is intentionally isolated from TypeScript.
import * as THREE from 'three/webgpu';
import {
  attributeArray,
  instancedArray,
  uniform,
} from 'three/tsl';
import {
  FLOWER_PARTICLES,
} from './flower-particle-contract';
import {
  LIVING_FLOWER,
  LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES,
} from '../simulation/living-flower-contract';
import { createFlowerParticleComputeGraph } from './flower-particle-compute-graph';

export function createFlowerParticleGpu(simulation) {
  const config = FLOWER_PARTICLES;
  const maximumParticles = config.maximumParticles;
  const maximumInteractionEvents =
    LIVING_FLOWER.maximumBrushSamples *
    config.interactionVerticesPerSample;
  const connectionCount =
    maximumParticles * config.connectionsPerParticle;

  const positionAgeStorage = instancedArray(maximumParticles, 'vec4')
    .setName('flowerParticlePositionAge');
  const velocityLifetimeStorage = instancedArray(maximumParticles, 'vec4')
    .setName('flowerParticleVelocityLifetime');
  const appearanceStorage = instancedArray(maximumParticles, 'vec4')
    .setName('flowerParticleAppearance');
  const connectionAnchorStorage = attributeArray(connectionCount, 'vec4')
    .setName('flowerParticleConnectionAnchors');
  const interactionEventStorage = attributeArray(
    maximumInteractionEvents * 2,
    'vec4',
  ).setName('flowerParticleInteractionEvents');
  const anchorMetadataStorage = attributeArray(
    LIVING_FLOWER.maximumPetals,
    'vec4',
  ).setName('flowerParticleAnchorMetadata');
  const introStartPositionStorage = attributeArray(
    new Float32Array(
      LIVING_FLOWER_MAXIMUM_RENDER_PARTICLES * 4,
    ),
    'vec4',
  ).setName('flowerParticleIntroStartPositions');

  const deltaSecondsNode = uniform(0);
  const elapsedSecondsNode = uniform(0);
  const emissionElapsedSecondsNode = uniform(0);
  const resetNode = uniform(0, 'uint');
  const introSpawnStartNode = uniform(0, 'uint');
  const introSpawnCountNode = uniform(0, 'uint');
  const introSpawnSequenceNode = uniform(0, 'uint');
  const stageThreeProgressNode = uniform(0);
  const stageThreeSpreadProgressNode = uniform(0);
  const stageThreeReturnActiveNode = uniform(0);
  const stageThreeReturnProgressNode = uniform(0);
  const stageThreeReturnStartProgressNode = uniform(0);
  const stageThreeSpawnStartNode = uniform(0, 'uint');
  const stageThreeSpawnCountNode = uniform(0, 'uint');
  const stageThreeSpawnSequenceNode = uniform(0, 'uint');
  const stageThreeAttractorNode = uniform(new THREE.Vector3());
  const interactionSpawnStartNode = uniform(0, 'uint');
  const interactionEventCountNode = uniform(0, 'uint');
  const interactionSpawnSequenceNode = uniform(0, 'uint');
  const interactionSampleCountNode = uniform(0, 'uint');
  const localToClipNode = uniform(new THREE.Matrix4());
  const clipToLocalNode = uniform(new THREE.Matrix4());
  const interactionCssSizeNode = uniform(new THREE.Vector2(1, 1));

  const {
    interactionSourceNode,
    lifecycleNode,
    stageThreePosition,
  } =
    createFlowerParticleComputeGraph({
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
    });

  const computeNodes = [interactionSourceNode, lifecycleNode];
  const storageNodes = [
    positionAgeStorage,
    velocityLifetimeStorage,
    appearanceStorage,
    connectionAnchorStorage,
    interactionEventStorage,
    anchorMetadataStorage,
    introStartPositionStorage,
  ];

  function dispose() {
    computeNodes.forEach((node) => node.dispose());
    storageNodes.forEach((node) => node.value.dispose());
  }

  return {
    positionAgeStorage,
    velocityLifetimeStorage,
    appearanceStorage,
    connectionAnchorStorage,
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
    interactionSourceNode,
    lifecycleNode,
    stageThreePosition,
    dispose,
  };
}
