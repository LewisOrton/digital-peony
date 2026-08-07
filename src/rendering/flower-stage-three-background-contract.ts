export const FLOWER_STAGE_THREE_BACKGROUND = Object.freeze({
  maximumLongAxisCells: 3,
  maximumShortAxisCells: 2,
  minimumShortAxisCells: 2,
  overscanCells: 1,
  motionDurationSeconds: 0.72,
  accelerationDurationSeconds: 0.14,
  interlaceDisplacementCells: 1,
  glyphFill: 0.86,
  depthBehindTarget: 2.25,
  revealDurationSeconds: 1.45,
  returnFadeInitialOpacity: 0.88,
});

export type FlowerStageThreeBackgroundMode =
  | 'horizontal-rows'
  | 'vertical-columns';

export type FlowerStageThreeBackgroundTimeline = {
  segment: number;
  mode: FlowerStageThreeBackgroundMode;
  progress: number;
};

export type FlowerStageThreeBackgroundCell = {
  column: number;
  row: number;
  glyphKind: 0 | 1;
};

export type FlowerStageThreeBackgroundLattice = {
  columns: number;
  rows: number;
  originX: number;
  originY: number;
  cells: FlowerStageThreeBackgroundCell[];
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function sampleFlowerStageThreeBackgroundReveal(
  elapsedSeconds: number,
) {
  const progress = clamp01(
    Math.max(0, elapsedSeconds) /
      FLOWER_STAGE_THREE_BACKGROUND.revealDurationSeconds,
  );
  return progress * 0.22 + progress * progress * 0.78;
}

export function sampleFlowerStageThreeBackgroundShift(
  progress: number,
) {
  const amount = clamp01(progress);
  const cap =
    FLOWER_STAGE_THREE_BACKGROUND.accelerationDurationSeconds /
    FLOWER_STAGE_THREE_BACKGROUND.motionDurationSeconds;
  const slope = 1 / (1 - cap);
  if (amount < cap) {
    const local = amount / cap;
    return slope * cap * (local ** 3 - local ** 4 / 2);
  }
  if (amount > 1 - cap) {
    const local = (1 - amount) / cap;
    return 1 - slope * cap * (local ** 3 - local ** 4 / 2);
  }
  return slope * (amount - cap / 2);
}

export function sampleFlowerStageThreeBackgroundTimeline(
  elapsedSeconds: number,
): FlowerStageThreeBackgroundTimeline {
  const elapsed = Math.max(0, elapsedSeconds);
  const segmentDuration =
    FLOWER_STAGE_THREE_BACKGROUND.motionDurationSeconds;
  const segment = Math.floor(elapsed / segmentDuration);
  const mode: FlowerStageThreeBackgroundMode = segment % 2 === 0
    ? 'horizontal-rows'
    : 'vertical-columns';
  const localElapsed = elapsed - segment * segmentDuration;
  const progress = sampleFlowerStageThreeBackgroundShift(
    localElapsed / FLOWER_STAGE_THREE_BACKGROUND.motionDurationSeconds,
  );
  return {
    segment,
    mode,
    progress,
  };
}

export function flowerStageThreeBackgroundDirection(slot: number) {
  return (slot & 1) === 0 ? -1 : 1;
}

function glyphKindForCell(column: number, row: number): 0 | 1 {
  const hash = Math.imul(column, 73856093) ^ Math.imul(row, 19349663);
  return (hash & 1) as 0 | 1;
}

export function createFlowerStageThreeBackgroundLattice(
  columns: number,
  rows: number,
): FlowerStageThreeBackgroundLattice {
  const cells: FlowerStageThreeBackgroundCell[] = [];
  for (let row = -1; row <= rows; row += 1) {
    for (let column = -1; column <= columns; column += 1) {
      cells.push({
        column,
        row,
        glyphKind: glyphKindForCell(column, row),
      });
    }
  }
  return { columns, rows, originX: 0, originY: 0, cells };
}

function wrapSlot(value: number, visibleCount: number) {
  const paddedCount = visibleCount + 2;
  return ((value + 1) % paddedCount + paddedCount) % paddedCount - 1;
}

export function advanceFlowerStageThreeBackgroundLattice(
  lattice: FlowerStageThreeBackgroundLattice,
  mode: FlowerStageThreeBackgroundMode,
): FlowerStageThreeBackgroundLattice {
  let originX = lattice.originX;
  let originY = lattice.originY;
  const cells = lattice.cells.map((cell) => ({ ...cell }));
  if (mode === 'horizontal-rows') {
    for (const cell of cells) {
      if (flowerStageThreeBackgroundDirection(cell.row) > 0) {
        cell.column += 1;
      }
    }
    originX -= 0.5;
    if (originX <= -1) {
      originX += 1;
      for (const cell of cells) cell.column -= 1;
    }
    for (const cell of cells) {
      cell.column = wrapSlot(cell.column, lattice.columns);
    }
  } else {
    for (const cell of cells) {
      if (flowerStageThreeBackgroundDirection(cell.column) > 0) {
        cell.row += 1;
      }
    }
    originY -= 0.5;
    if (originY <= -1) {
      originY += 1;
      for (const cell of cells) cell.row -= 1;
    }
    for (const cell of cells) {
      cell.row = wrapSlot(cell.row, lattice.rows);
    }
  }
  return { ...lattice, originX, originY, cells };
}

export function calculateFlowerStageThreeBackgroundGrid(
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const maximumLong = FLOWER_STAGE_THREE_BACKGROUND.maximumLongAxisCells;
  const maximumShort = FLOWER_STAGE_THREE_BACKGROUND.maximumShortAxisCells;
  const minimum = FLOWER_STAGE_THREE_BACKGROUND.minimumShortAxisCells;
  const aspectRatio = Math.max(safeWidth, safeHeight) /
    Math.min(safeWidth, safeHeight);
  if (aspectRatio < 1.2) {
    return { columns: maximumShort, rows: maximumShort };
  }
  if (safeWidth >= safeHeight) {
    return {
      columns: maximumLong,
      rows: Math.max(
        minimum,
        Math.min(
          maximumShort,
          Math.ceil(maximumLong * safeHeight / safeWidth),
        ),
      ),
    };
  }
  return {
    columns: Math.max(
      minimum,
      Math.min(
        maximumShort,
        Math.ceil(maximumLong * safeWidth / safeHeight),
      ),
    ),
    rows: maximumLong,
  };
}

export function calculateFlowerStageThreeBackgroundCellPitch(
  width: number,
  height: number,
  columns: number,
  rows: number,
) {
  const cellWidth = Math.max(1, width) / Math.max(1, columns);
  const cellHeight = Math.max(1, height) / Math.max(1, rows);
  const sharedPitch = Math.min(cellWidth, cellHeight);
  return {
    x: sharedPitch / cellWidth,
    y: sharedPitch / cellHeight,
  };
}
