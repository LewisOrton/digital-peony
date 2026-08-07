import * as THREE from 'three/webgpu';

export type FlowerBaseSettings = {
  anchorCount: number;
  radius: number;
  domeHeight: number;
};

export const FLOWER_BASE_DEFAULTS: Readonly<FlowerBaseSettings> = Object.freeze({
  anchorCount: 36,
  radius: 0.1,
  domeHeight: 0.08,
});

export type FlowerAnchor = {
  index: number;
  sequenceT: number;
  outness: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  orientation: THREE.Quaternion;
};

export function buildFlowerAnchors(parameters: FlowerBaseSettings) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const domeApex = new THREE.Vector3(0, parameters.domeHeight, 0);
  const anchors: FlowerAnchor[] = [];

  for (let index = 0; index < parameters.anchorCount; index += 1) {
    const sequenceT =
      parameters.anchorCount === 1 ? 0 : index / (parameters.anchorCount - 1);
    const outness = Math.sqrt(sequenceT);
    const angle = index * goldenAngle;
    const x = Math.cos(angle) * outness * parameters.radius;
    const z = Math.sin(angle) * outness * parameters.radius;
    const y =
      parameters.domeHeight *
      Math.sqrt(Math.max(0, 1 - outness * outness));
    const normal = new THREE.Vector3(
      x / (parameters.radius * parameters.radius),
      y / (parameters.domeHeight * parameters.domeHeight),
      z / (parameters.radius * parameters.radius),
    ).normalize();
    const position = new THREE.Vector3(x, y, z);
    const growthDirection = domeApex
      .clone()
      .sub(position)
      .projectOnPlane(normal);
    if (growthDirection.lengthSq() === 0) {
      growthDirection.set(0, 0, 1);
    } else {
      growthDirection.normalize();
    }
    const sideways = growthDirection.clone().cross(normal).normalize();
    const orientation = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(sideways, growthDirection, normal),
    );

    anchors.push({
      index,
      sequenceT,
      outness,
      position,
      normal,
      orientation,
    });
  }

  return anchors;
}
