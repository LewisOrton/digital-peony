import * as THREE from 'three/webgpu';
import type { FlowerStageThreeMotion } from '../presentation/flower-stage-three';
import {
  advanceFlowerStageThreeBackgroundLattice,
  calculateFlowerStageThreeBackgroundGrid,
  calculateFlowerStageThreeBackgroundCellPitch,
  createFlowerStageThreeBackgroundLattice,
  FLOWER_STAGE_THREE_BACKGROUND,
  flowerStageThreeBackgroundDirection,
  sampleFlowerStageThreeBackgroundReveal,
  sampleFlowerStageThreeBackgroundTimeline,
} from './flower-stage-three-background-contract';
import type {
  FlowerStageThreeBackgroundLattice,
  FlowerStageThreeBackgroundMode,
} from './flower-stage-three-background-contract';
import type {
  FlowerStageThreeBackgroundSettings,
} from './flower-stage-three-background-settings';
import { createFlowerStageThreeBackgroundGraphics } from './flower-stage-three-background-graphics';
import type { ReadonlyPetalGeometrySettings } from '../geometry/petal';
import type { FlowerModeSettings } from '../geometry/flower-mode';

export function calculateFlowerStageThreePetalFieldLayout(
  cameraAspect: number,
) {
  const landscapeAspect = Math.max(1, cameraAspect);
  return {
    horizontalBucketCount: Math.ceil(landscapeAspect),
    horizontalPositionScale: Math.min(1, cameraAspect),
  };
}

export function calculateFlowerStageThreePetalDensityScale(
  cameraAspect: number,
) {
  return Math.max(1, cameraAspect);
}

export function createFlowerStageThreeBackground(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  keyLight: THREE.DirectionalLight,
  backlightStrengthNode: any,
  rimLightStrengthNode: any,
  getTarget: () => THREE.Vector3,
  initialSettings: FlowerStageThreeBackgroundSettings,
  petalSettings: ReadonlyPetalGeometrySettings,
  flowerSettings: FlowerModeSettings,
) {
  const graphics = createFlowerStageThreeBackgroundGraphics({
    scene,
    camera,
    backlightStrengthNode,
    rimLightStrengthNode,
    initialSettings,
    petalSettings,
    flowerSettings,
    densityScale: calculateFlowerStageThreePetalDensityScale,
  });
  const {
    geometry,
    cellPositions,
    rowDirections,
    columnDirections,
    selectedGlyphs,
    cellPositionAttribute,
    rowDirectionAttribute,
    columnDirectionAttribute,
    selectedGlyphAttribute,
    gridNode,
    gridLayoutPitchNode,
    glyphScaleNode,
    horizontalProgressNode,
    verticalProgressNode,
    maskMaterial,
    revealMaterial,
    maskMesh,
    revealMesh,
    petalMesh,
    backgroundPetalGeometry,
    backgroundPetalCount,
    petalFlowPhases,
    petalFlowPhaseAttribute,
    petalTimeNode,
    keyLightDirectionNode,
    keyLightColorNode,
    transitionOpacityNode,
    petalMaterial,
    backgroundPetalHorizontalExtent,
    drawnPetalCount,
  } = graphics;

  const cameraDirection = new THREE.Vector3();
  const target = new THREE.Vector3();
  let stageThreeStartedAt: number | null = null;
  let progress = 0;
  let motion: FlowerStageThreeMotion = {
    phase: 'interactive',
    spreadProgress: 0,
    returnProgress: 0,
    returnStartProgress: 0,
  };
  let gridColumns = 0;
  let gridRows = 0;
  let layoutWidth = 0;
  let layoutHeight = 0;
  let layoutCameraAspect = 0;
  let lattice: FlowerStageThreeBackgroundLattice | null = null;
  let appliedSegments = 0;
  const settings = { ...initialSettings };
  const petalMatrix = new THREE.Matrix4();
  const petalPositionValue = new THREE.Vector3();
  const petalQuaternion = new THREE.Quaternion();
  const petalRotation = new THREE.Euler();
  const petalScale = new THREE.Vector3();

  function seededValue(index: number, salt: number) {
    return Math.abs(Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453) % 1;
  }

  function updatePetalInstances(cameraAspect: number) {
    const fieldLayout = calculateFlowerStageThreePetalFieldLayout(
      cameraAspect,
    );
    for (let index = 0; index < backgroundPetalCount; index += 1) {
      const positionUnitX = seededValue(index, 1);
      const positionUnitY = seededValue(index, 2);
      const horizontalBucket =
        index % fieldLayout.horizontalBucketCount;
      const squareBasisX =
        (
          horizontalBucket + positionUnitX -
          fieldLayout.horizontalBucketCount * 0.5
        ) * backgroundPetalHorizontalExtent * 2;
      const size = THREE.MathUtils.lerp(
        0.029,
        0.043,
        seededValue(index, 3),
      );
      petalFlowPhases[index] =
        (
          positionUnitX * 1.05 +
          positionUnitY * 0.68
        ) / settings.windNoiseScale +
        seededValue(index, 8) * 0.08;
      petalPositionValue.set(
        squareBasisX * fieldLayout.horizontalPositionScale,
        -1.2 + positionUnitY * 2.4,
        -0.09 + seededValue(index, 4) * 0.18,
      );
      petalRotation.set(
        (seededValue(index, 5) - 0.5) * 1.4,
        (seededValue(index, 6) - 0.5) * 1.25,
        (seededValue(index, 7) - 0.5) * Math.PI * 2,
      );
      petalQuaternion.setFromEuler(petalRotation);
      petalScale.set(
        size * settings.petalSize *
          THREE.MathUtils.lerp(0.82, 1.18, seededValue(index, 9)),
        size * settings.petalSize,
        size * settings.petalSize,
      );
      petalMatrix.compose(
        petalPositionValue,
        petalQuaternion,
        petalScale,
      );
      petalMesh.setMatrixAt(index, petalMatrix);
    }
    petalFlowPhaseAttribute.needsUpdate = true;
    petalMesh.instanceMatrix.needsUpdate = true;
  }

  function updateDrawnPetalCount(cameraAspect: number) {
    petalMesh.count = drawnPetalCount(settings.petalCount, cameraAspect);
  }

  function writeLatticeAttributes() {
    if (lattice === null) return;
    maskMesh.count = lattice.cells.length;
    for (let index = 0; index < lattice.cells.length; index += 1) {
      const cell = lattice.cells[index];
      cellPositions[index * 2] = cell.column + lattice.originX;
      cellPositions[index * 2 + 1] = cell.row + lattice.originY;
      rowDirections[index] = flowerStageThreeBackgroundDirection(cell.row);
      columnDirections[index] = flowerStageThreeBackgroundDirection(
        cell.column,
      );
      selectedGlyphs[index] = cell.glyphKind;
    }
    cellPositionAttribute.needsUpdate = true;
    rowDirectionAttribute.needsUpdate = true;
    columnDirectionAttribute.needsUpdate = true;
    selectedGlyphAttribute.needsUpdate = true;
  }

  function resetLattice() {
    if (gridColumns === 0 || gridRows === 0) return;
    lattice = createFlowerStageThreeBackgroundLattice(
      gridColumns,
      gridRows,
    );
    appliedSegments = 0;
    writeLatticeAttributes();
  }

  function advanceToSegment(segment: number) {
    if (lattice === null) resetLattice();
    while (lattice !== null && appliedSegments < segment) {
      const completedMode: FlowerStageThreeBackgroundMode =
        appliedSegments % 2 === 0
          ? 'horizontal-rows'
          : 'vertical-columns';
      lattice = advanceFlowerStageThreeBackgroundLattice(
        lattice,
        completedMode,
      );
      appliedSegments += 1;
      writeLatticeAttributes();
    }
  }

  function updateGrid() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const grid = calculateFlowerStageThreeBackgroundGrid(width, height);
    const gridChanged =
      grid.columns !== gridColumns || grid.rows !== gridRows;
    if (
      width === layoutWidth &&
      height === layoutHeight &&
      camera.aspect === layoutCameraAspect
    ) return;
    layoutWidth = width;
    layoutHeight = height;
    layoutCameraAspect = camera.aspect;
    gridColumns = grid.columns;
    gridRows = grid.rows;
    gridNode.value.set(gridColumns, gridRows);
    const cellWidth = width / gridColumns;
    const cellHeight = height / gridRows;
    const squareSize = Math.min(cellWidth, cellHeight);
    const layoutPitch = calculateFlowerStageThreeBackgroundCellPitch(
      width,
      height,
      gridColumns,
      gridRows,
    );
    gridLayoutPitchNode.value.set(layoutPitch.x, layoutPitch.y);
    glyphScaleNode.value.set(
      squareSize / cellWidth,
      squareSize / cellHeight,
    );
    updateDrawnPetalCount(camera.aspect);
    updatePetalInstances(camera.aspect);
    if (gridChanged) resetLattice();
  }

  function begin(timestamp: number) {
    stageThreeStartedAt = timestamp;
    resetLattice();
  }

  function setProgress(
    nextProgress: number,
    nextMotion: FlowerStageThreeMotion,
  ) {
    progress = THREE.MathUtils.clamp(nextProgress, 0, 1);
    motion = nextMotion;
    if (motion.phase === 'interactive') stageThreeStartedAt = null;
  }

  function update(timestamp: number, enabled: boolean) {
    const active = enabled && motion.phase !== 'interactive' && progress > 0;
    maskMesh.visible = active;
    revealMesh.visible = active;
    petalMesh.visible = active;
    if (!active) return;

    updateGrid();
    const elapsedSeconds = stageThreeStartedAt === null
      ? 0
      : Math.max(0, (timestamp - stageThreeStartedAt) / 1000);
    const revealProgress = motion.phase === 'entering'
      ? sampleFlowerStageThreeBackgroundReveal(elapsedSeconds)
      : 1;
    const transitionOpacity = motion.phase === 'returning'
      ? FLOWER_STAGE_THREE_BACKGROUND.returnFadeInitialOpacity *
        (1 - motion.returnProgress)
      : 1;
    transitionOpacityNode.value = transitionOpacity;
    const revealRadius = revealProgress * 1.08 * Math.hypot(
      camera.aspect,
      1,
    );
    const timeline = sampleFlowerStageThreeBackgroundTimeline(elapsedSeconds);
    petalTimeNode.value = timestamp / 1000;
    keyLightDirectionNode.value.copy(keyLight.position)
      .sub(keyLight.target.position).normalize();
    keyLightColorNode.value.copy(keyLight.color)
      .multiplyScalar(keyLight.intensity * 0.22);
    advanceToSegment(timeline.segment);
    const laneTravel =
      FLOWER_STAGE_THREE_BACKGROUND.interlaceDisplacementCells * 0.5;
    const horizontalProgress = timeline.mode === 'horizontal-rows'
      ? timeline.progress * laneTravel
      : 0;
    const verticalProgress = timeline.mode === 'vertical-columns'
      ? timeline.progress * laneTravel
      : 0;
    horizontalProgressNode.value = horizontalProgress;
    verticalProgressNode.value = verticalProgress;
    camera.getWorldDirection(cameraDirection);
    target.copy(getTarget());
    const targetDepth = camera.position.distanceTo(target);
    const depth = targetDepth + FLOWER_STAGE_THREE_BACKGROUND.depthBehindTarget;
    maskMesh.position
      .copy(camera.position)
      .addScaledVector(cameraDirection, depth);
    maskMesh.quaternion.copy(camera.quaternion);
    revealMesh.position.copy(maskMesh.position);
    revealMesh.quaternion.copy(camera.quaternion);
    petalMesh.position.copy(maskMesh.position);
    petalMesh.quaternion.copy(camera.quaternion);
    const viewHeight =
      2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * depth;
    const viewWidth = viewHeight * camera.aspect;
    maskMesh.scale.set(viewWidth * 0.5, viewHeight * 0.5, 1);
    revealMesh.scale.setScalar(viewHeight * 0.5 * revealRadius);
    petalMesh.scale.set(viewHeight * 0.5, viewHeight * 0.5, 1);
    maskMesh.updateMatrixWorld();
    revealMesh.updateMatrixWorld();
    petalMesh.updateMatrixWorld();
  }

  function preparePrewarm() {
    updateGrid();

    const previousVisibility = {
      mask: maskMesh.visible,
      reveal: revealMesh.visible,
      petals: petalMesh.visible,
    };
    maskMesh.visible = true;
    revealMesh.visible = true;
    petalMesh.visible = true;
    return {
      dispose() {
      maskMesh.visible = previousVisibility.mask;
      revealMesh.visible = previousVisibility.reveal;
      petalMesh.visible = previousVisibility.petals;
      },
    };
  }

  function dispose() {
    maskMesh.removeFromParent();
    revealMesh.removeFromParent();
    petalMesh.removeFromParent();
    maskMesh.dispose();
    revealMesh.geometry.dispose();
    petalMesh.dispose();
    geometry.dispose();
    backgroundPetalGeometry.dispose();
    maskMaterial.dispose();
    revealMaterial.dispose();
    petalMaterial.dispose();
  }

  return {
    begin,
    preparePrewarm,
    setProgress,
    update,
    dispose,
  };
}
