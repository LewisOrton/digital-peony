import * as THREE from 'three/webgpu';
import {
  PCFShadowFilter,
  faceDirection,
  float,
  instanceIndex,
  lightShadowMatrix,
  mix,
  normalWorld,
  positionWorld,
  texture,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { CANOPY_OCCLUSION } from './canopy-occlusion';
import {
  createBakedPetalBumpNormalNode,
} from './baked-petal-bump';
import type { ValueNode } from '../geometry/geometry-contract';
import {
  createPetalDeformation,
  type PetalDeformation,
} from '../geometry/petal-deformation';
import type { DemoState } from '../state/state';
import { createTopEdgeAlphaCutoutMasks } from './top-edge-alpha-cutout';
import {
  createPetalLookNodes,
} from './petal-lookdev';
import { createStablePetalSeedNode } from './petal-broad-texture-bake';
import { PETAL_LOOKDEV } from './petal-lookdev-contract';
import { createRimLightNode } from './rim-light';
import { createBacklightBumpReliefNode } from './backlight-bump-relief';
import {
  createFlowerInteractionMaterial,
  type FlowerInteractionMaterial,
} from './flower-interaction-material';
import { createFlowerPetalCorruption } from './flower-petal-corruption';

export const DIRECTIONAL_SHADOW_PCF_RADIUS = 6;
export const DIRECTIONAL_SHADOW_DEPTH_BIAS = -0.0003;
export const DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.01;
export const CUSTOM_SHADOW_RECEIVER_BIAS = 0.021;

export type Lookdev = {
  materials: {
    flowerPetal: THREE.MeshStandardNodeMaterial;
    flowerInteraction: THREE.MeshStandardNodeMaterial;
    flowerPresentationDigital: THREE.MeshStandardNodeMaterial;
    flowerPresentationReal: THREE.MeshStandardNodeMaterial;
    flowerCorruption: THREE.MeshBasicNodeMaterial;
    flowerCorruptionWireframe: THREE.MeshBasicNodeMaterial;
  };
  deformation: PetalDeformation;
  lighting: {
    backlightStrength: ValueNode<number>;
    rimLightStrength: ValueNode<number>;
    updateDirectionalLight(): void;
    bindShadowDepthTexture(depthTexture: THREE.DepthTexture): void;
  };
  fineVein: {
    updateTime(timestampMilliseconds: number): void;
  };
  interactionMaterial: FlowerInteractionMaterial;
  corruption: ReturnType<typeof createFlowerPetalCorruption>;
  dispose(): void;
};

export function createLookdev(
  keyLight: THREE.DirectionalLight,
  state: DemoState,
  textureInputs: {
    fineVein: THREE.Texture;
    bump: THREE.Texture;
    albedoGrain: THREE.Texture;
    broad: THREE.StorageArrayTexture;
  },
): Lookdev {
  const deformation = createPetalDeformation(
    state.flower,
    state.petal,
    state.simulation,
    state.flowerBase,
  );
  const makeUniform = uniform as (...values: any[]) => any;
  const makeFloat = float as (...values: any[]) => any;
  const makeTexture = texture as (...values: any[]) => any;
  const makeVec3 = vec3 as (...values: any[]) => any;
  const makeVec4 = vec4 as (...values: any[]) => any;
  const worldPositionNode: any = positionWorld;
  const visibleBumpWorldNormalNode: any = normalWorld;
  const visibleFaceDirectionNode: any = faceDirection;
  const backlightStrengthNode: any = makeUniform(
    state.lighting.backlightStrength,
  );
  const rimLightStrengthNode: any = makeUniform(
    state.lighting.rimLightStrength,
  );
  const canopyOcclusionStrengthNode: any = makeUniform(
    state.lighting.canopyOcclusionStrength,
  );
  const fineVeinStrengthNode: any = makeUniform(
    state.lighting.fineVeinDetailStrength,
  );
  const bumpStrengthNode: any = makeUniform(
    state.lighting.bumpStrength,
  );
  const fineVeinElapsedSecondsNode: any = makeUniform(0);
  const backlightDirectionNode: any = makeUniform(
    new THREE.Vector3(3, 4, 5).normalize(),
  );
  const backlightLightColorNode: any = makeUniform(
    new THREE.Color(3, 3, 3),
  );
  const backlightPetalColorNode: any = makeUniform(
    new THREE.Color(0xc7a9b8),
  );
  const keyLightShadowMatrixNode: any = (lightShadowMatrix as any)(
    keyLight,
  );
  const uvNode = deformation.nodes.uv;
  const topEdgeMasks = createTopEdgeAlphaCutoutMasks(uvNode);
  const flowerLook = createPetalLookNodes({
    uvNode,
    broadLayerNode: instanceIndex,
    seedNode: createStablePetalSeedNode(instanceIndex),
    elapsedSecondsNode: fineVeinElapsedSecondsNode,
    fineVeinStrengthNode,
    fineVeinTexture: textureInputs.fineVein,
    albedoGrainTexture: textureInputs.albedoGrain,
    broadTexture: textureInputs.broad,
  });
  const flowerCorruption = createFlowerPetalCorruption({
    positionNode: deformation.nodes.flowerPosition,
    realColorNode: flowerLook.color,
    realMaskNode: topEdgeMasks.flower,
  });
  const flowerBumpNormalNode = createBakedPetalBumpNormalNode({
    uvNode,
    seedNode: createStablePetalSeedNode(instanceIndex),
    strengthNode: bumpStrengthNode,
    baseViewNormalNode: deformation.nodes.flowerViewNormal,
    tangentAcrossNode: deformation.nodes.flowerViewTangentAcross,
    tangentAlongNode: deformation.nodes.flowerViewTangentAlong,
    faceDirectionNode: visibleFaceDirectionNode,
    bumpTexture: textureInputs.bump,
  });

  function shadowVisibilityNode(depthNode: any) {
    const shadowWorldPosition = worldPositionNode.add(
      backlightDirectionNode.mul(
        CUSTOM_SHADOW_RECEIVER_BIAS,
      ),
    );
    const projected = keyLightShadowMatrixNode.mul(
      makeVec4(shadowWorldPosition, 1),
    );
    const projectedCoord = projected.xyz.div(projected.w);
    const shadowCoord = makeVec3(
      projectedCoord.x,
      projectedCoord.y.oneMinus(),
      projectedCoord.z.add(keyLight.shadow.bias),
    );
    const pcf = (PCFShadowFilter as any)({
      depthTexture: depthNode,
      shadowCoord,
      shadow: keyLight.shadow,
    });
    const inside = shadowCoord.x
      .greaterThanEqual(0)
      .and(shadowCoord.x.lessThanEqual(1))
      .and(shadowCoord.y.greaterThanEqual(0))
      .and(shadowCoord.y.lessThanEqual(1))
      .and(shadowCoord.z.lessThanEqual(1));
    return inside.select(pcf, 1);
  }

  function backlightNode(
    worldNormal: any,
    shadowVisibility: any,
    transmissionMask: any,
  ) {
    const smoothVisibleWorldNormal = worldNormal.mul(
      visibleFaceDirectionNode,
    );
    const smoothLobe = smoothVisibleWorldNormal
      .negate()
      .dot(backlightDirectionNode)
      .max(0)
      .pow(1.5);
    const relief = createBacklightBumpReliefNode({
      smoothVisibleWorldNormalNode: smoothVisibleWorldNormal,
      bumpVisibleWorldNormalNode: visibleBumpWorldNormalNode,
      lightDirectionNode: backlightDirectionNode,
      bumpStrengthNode,
    });
    const lobe = smoothLobe.mul(relief);
    return backlightPetalColorNode
      .mul(backlightLightColorNode)
      .mul(lobe)
      .mul((mix as any)(0.18, 1, shadowVisibility))
      .mul(transmissionMask)
      .mul(backlightStrengthNode);
  }

  function petalEmissiveNode(
    worldNormal: any,
    shadowVisibility: any,
    transmissionMask: any,
    petalColor: any,
    topEdgeCutDepth: any,
    topEdgeDetailSignal: any,
  ) {
    return backlightNode(
      worldNormal,
      shadowVisibility,
      transmissionMask,
    ).add(
      createRimLightNode({
        uvNode,
        topEdgeCutDepthNode: topEdgeCutDepth,
        topEdgeDetailSignalNode: topEdgeDetailSignal,
        worldNormalNode: worldNormal,
        visibleFaceDirectionNode,
        lightDirectionNode: backlightDirectionNode,
        petalColorNode: petalColor,
        strengthNode: rimLightStrengthNode,
      }),
    );
  }

  function canopyAmbientVisibilityNode(rootMask: any) {
    const strengthResponse = canopyOcclusionStrengthNode.mul(
      canopyOcclusionStrengthNode
        .mul(CANOPY_OCCLUSION.maximumStrengthGain - 1)
        .add(1),
    );
    const occlusion = rootMask
      .mul(strengthResponse)
      .clamp(0, 1);
    return occlusion.oneMinus();
  }

  const flowerPetalMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: 0xc7a9b8,
    roughness: PETAL_LOOKDEV.roughness.base,
    metalness: 0,
    ior: PETAL_LOOKDEV.reflectance.ior,
    side: THREE.DoubleSide,
  });
  flowerPetalMaterial.positionNode = deformation.nodes.flowerPosition;
  flowerPetalMaterial.colorNode = flowerLook.color;
  flowerPetalMaterial.normalNode = flowerBumpNormalNode;
  flowerPetalMaterial.roughnessNode = flowerLook.roughness;
  flowerPetalMaterial.maskNode = topEdgeMasks.flower;
  flowerPetalMaterial.maskShadowNode = topEdgeMasks.flower;
  const flowerAoNode = canopyAmbientVisibilityNode(
    flowerLook.canopyRootMask,
  );
  flowerPetalMaterial.aoNode = flowerAoNode;
  const initialFlowerEmissiveNode = petalEmissiveNode(
    deformation.nodes.flowerWorldNormal,
    makeFloat(1),
    flowerLook.transmission,
    flowerLook.color,
    topEdgeMasks.flowerCutDepth,
    topEdgeMasks.flowerDetailSignal,
  );
  flowerPetalMaterial.emissiveNode = initialFlowerEmissiveNode;
  const flowerInteractionMaterial = createFlowerInteractionMaterial({
    positionNode: deformation.nodes.flowerPosition,
    curvinessDeltaNode: deformation.nodes.flowerCurvinessDelta,
    introStartCurvinessDeltaNode:
      deformation.nodes.flowerIntroStartCurvinessDelta,
    realColorNode: flowerLook.color,
    realNormalNode: flowerBumpNormalNode,
    realRoughnessNode: flowerLook.roughness,
    realEmissiveNode: initialFlowerEmissiveNode,
    realAoNode: flowerAoNode,
    realMaskNode: topEdgeMasks.flower,
  });
  let shadowBound = false;
  let disposed = false;
  let fineVeinStartTimestamp: number | null = null;

  function updateFineVeinTime(timestampMilliseconds: number) {
    fineVeinStartTimestamp ??= timestampMilliseconds;
    fineVeinElapsedSecondsNode.value =
      (timestampMilliseconds - fineVeinStartTimestamp) / 1000;
  }

  function bindShadowDepthTexture(depthTexture: THREE.DepthTexture) {
    if (shadowBound) return;
    shadowBound = true;
    const depthNode = makeTexture(depthTexture);
    const flowerVisibility = shadowVisibilityNode(depthNode);
    const flowerEmissiveNode = petalEmissiveNode(
      deformation.nodes.flowerWorldNormal,
      flowerVisibility,
      flowerLook.transmission,
      flowerLook.color,
      topEdgeMasks.flowerCutDepth,
      topEdgeMasks.flowerDetailSignal,
    );
    flowerPetalMaterial.emissiveNode = flowerEmissiveNode;
    flowerInteractionMaterial.setRealEmissiveNode(flowerEmissiveNode);
    flowerPetalMaterial.needsUpdate = true;
  }

  function updateDirectionalLight() {
    backlightDirectionNode.value
      .copy(keyLight.position)
      .sub(keyLight.target.position)
      .normalize();
    backlightLightColorNode.value
      .copy(keyLight.color)
      .multiplyScalar(keyLight.intensity * 0.25);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    deformation.simulation.dispose();
    flowerPetalMaterial.dispose();
    flowerInteractionMaterial.digitalMaterial.dispose();
    flowerInteractionMaterial.realMaterial.dispose();
    flowerInteractionMaterial.interactionMaterial.dispose();
    flowerInteractionMaterial.dispose();
    flowerCorruption.dispose();
    keyLight.shadow.dispose();
  }

  updateDirectionalLight();

  return {
    materials: {
      flowerPetal: flowerPetalMaterial,
      flowerInteraction: flowerInteractionMaterial.interactionMaterial,
      flowerPresentationDigital: flowerInteractionMaterial.digitalMaterial,
      flowerPresentationReal: flowerInteractionMaterial.realMaterial,
      flowerCorruption: flowerCorruption.material,
      flowerCorruptionWireframe: flowerCorruption.wireframeMaterial,
    },
    deformation,
    lighting: {
      backlightStrength: backlightStrengthNode,
      rimLightStrength: rimLightStrengthNode,
      updateDirectionalLight,
      bindShadowDepthTexture,
    },
    fineVein: {
      updateTime: updateFineVeinTime,
    },
    interactionMaterial: flowerInteractionMaterial,
    corruption: flowerCorruption,
    dispose,
  };
}

export function createKeyLight() {
  const light = new THREE.DirectionalLight(0xffffff, 3);
  light.position.set(3, 4, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.radius = DIRECTIONAL_SHADOW_PCF_RADIUS;
  light.shadow.bias = DIRECTIONAL_SHADOW_DEPTH_BIAS;
  light.shadow.normalBias = DIRECTIONAL_SHADOW_NORMAL_BIAS;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 10;
  return light;
}
