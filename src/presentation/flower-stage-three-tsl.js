import { cos, float, sin, vec3 } from 'three/tsl';
import { FLOWER_STAGE_THREE } from './flower-stage-three';

export function transformFlowerStageThreePosition({
  petal,
  position,
  rootPosition,
  outness,
  spreadRootPosition,
  activePetalCount,
  progress,
  spreadProgress,
  returnActive,
  returnProgress,
  returnStartProgress,
}) {
  const easeOutCubic = (value) => float(1).sub(
    float(1).sub(value).pow(3),
  );
  const rotationStart = outness
    .clamp(0, 1)
    .mul(FLOWER_STAGE_THREE.rotationStagger);
  const rotationProgress = progress
    .sub(rotationStart)
    .div(float(1).sub(rotationStart))
    .clamp(0, 1);
  const rotationEaseOut = easeOutCubic(rotationProgress);
  const settled = progress.greaterThanEqual(1);
  const settledProgress = settled.select(float(1), progress.clamp(0, 1));
  const forwardRotationAmount = settled.select(
    float(1),
    rotationEaseOut,
  );
  const returnStartRotationProgress = returnStartProgress
    .sub(rotationStart)
    .div(float(1).sub(rotationStart))
    .clamp(0, 1);
  const returnStartRotationEaseOut = easeOutCubic(
    returnStartRotationProgress,
  );
  const returnEaseOut = easeOutCubic(returnProgress);
  const returnRotation = returnStartRotationEaseOut.mul(
    float(1).sub(returnEaseOut),
  );
  const rotationAmount = forwardRotationAmount
    .mul(float(1).sub(returnActive))
    .add(returnRotation.mul(returnActive));
  const rotationAngle = rotationAmount.mul(
    FLOWER_STAGE_THREE.rotationRadians,
  );
  const rotationCos = cos(rotationAngle);
  const rotationSin = sin(rotationAngle);
  const rotateAroundFlowerY = (direction) => vec3(
    direction.x.mul(rotationCos).add(direction.z.mul(rotationSin)),
    direction.y,
    direction.z.mul(rotationCos).sub(direction.x.mul(rotationSin)),
  );
  const rotatedPosition = rotateAroundFlowerY(position);
  const rotatedRoot = rotateAroundFlowerY(rootPosition);
  const spreadRoot = vec3(
    spreadRootPosition.x,
    0,
    spreadRootPosition.z,
  );
  const spreadDirection = spreadRoot.div(
    spreadRoot.length().max(0.0001),
  );
  const spreadStart = float(1)
    .sub(outness.clamp(0, 1))
    .mul(FLOWER_STAGE_THREE.petalSpreadStaggerFraction);
  const localSpreadProgress = spreadProgress
    .sub(spreadStart)
    .div(float(1).sub(FLOWER_STAGE_THREE.petalSpreadStaggerFraction))
    .clamp(0, 1);
  const forwardSpreadWeight = settled.select(
    float(0),
    float(1).sub(progress.clamp(0, 1)),
  );
  const returnStartSpreadWeight = float(1).sub(
    returnStartProgress.clamp(0, 1),
  );
  const returnSpreadWeight = returnStartSpreadWeight.mul(
    float(1).sub(returnEaseOut),
  );
  const spreadWeight = forwardSpreadWeight
    .mul(float(1).sub(returnActive))
    .add(returnSpreadWeight.mul(returnActive));
  const spread = easeOutCubic(localSpreadProgress)
    .clamp(0, 1)
    .mul(spreadWeight)
    .mul(outness.clamp(0, 1))
    .mul(FLOWER_STAGE_THREE.petalSpreadDistance);
  const radialRoot = vec3(rotatedRoot.x, 0, rotatedRoot.z);
  const outwardDirection = radialRoot.div(
    radialRoot.length().max(0.0001),
  );
  const outward = outness
    .clamp(0, 1)
    .pow(FLOWER_STAGE_THREE.outwardExponent)
    .mul(FLOWER_STAGE_THREE.maximumOutwardDisplacement)
    .mul(settledProgress);
  const descendingIntervalCount = activePetalCount
    .toFloat()
    .sub(FLOWER_STAGE_THREE.flatBottomPetalCount)
    .max(1);
  const targetOrder = float(petal)
    .div(descendingIntervalCount)
    .clamp(0, 1);
  const targetY = targetOrder
    .mul(
      FLOWER_STAGE_THREE.outerTargetY -
        FLOWER_STAGE_THREE.innerTargetY,
    )
    .add(FLOWER_STAGE_THREE.innerTargetY);
  const verticalDisplacement = targetY
    .sub(rootPosition.y)
    .mul(settledProgress);
  return rotatedPosition.add(
    spreadDirection
      .mul(spread)
      .add(outwardDirection.mul(outward))
      .add(vec3(0, verticalDisplacement, 0)),
  );
}
