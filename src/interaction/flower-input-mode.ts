export type FlowerInputMode =
  | 'locked'
  | 'pet'
  | 'stage-three';

export function createFlowerInputMode(
  canvas: HTMLCanvasElement,
) {
  let petEnabled = false;
  let stageThreeActive = false;
  let mode: FlowerInputMode = 'locked';
  canvas.style.touchAction = 'none';
  canvas.dataset.interaction = mode;

  function resolveMode(): FlowerInputMode {
    if (stageThreeActive) return 'stage-three';
    if (petEnabled) return 'pet';
    return 'locked';
  }

  function apply() {
    const nextMode = resolveMode();
    if (nextMode === mode) return;
    mode = nextMode;
    canvas.dataset.interaction = mode;
  }

  function setPetEnabled(enabled: boolean) {
    petEnabled = enabled;
    apply();
  }

  function setStageThreeActive(active: boolean) {
    stageThreeActive = active;
    apply();
  }

  return {
    setPetEnabled,
    setStageThreeActive,
  };
}

export type FlowerInputModeController = ReturnType<
  typeof createFlowerInputMode
>;
