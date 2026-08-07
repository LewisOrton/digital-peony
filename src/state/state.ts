import {
  FLOWER_BASE_DEFAULTS,
  type FlowerBaseSettings,
} from '../geometry/flower-base';
import {
  FLOWER_MODE_DEFAULTS,
  type FlowerModeSettings,
} from '../geometry/flower-mode';
import {
  PETAL_DEFAULTS,
  type ReadonlyPetalGeometrySettings,
} from '../geometry/petal';
import {
  FLOWER_STAGE_THREE_BACKGROUND_SETTINGS,
  type FlowerStageThreeBackgroundSettings,
} from '../rendering/flower-stage-three-background-settings';
import {
  SIMULATION_DEFAULTS,
  type SimulationSettings,
} from '../simulation/simulation-state';

const PETAL_LIGHTING = Object.freeze({
  backlightStrength: 2,
  rimLightStrength: 1,
  canopyOcclusionStrength: 0.54,
  fineVeinDetailStrength: 1,
  bumpStrength: 0.65,
});

export type DemoState = {
  petal: ReadonlyPetalGeometrySettings;
  flower: FlowerModeSettings;
  flowerBase: FlowerBaseSettings;
  lighting: typeof PETAL_LIGHTING;
  backgroundPetals: FlowerStageThreeBackgroundSettings;
  simulation: SimulationSettings;
};

function cloneCurve(
  curve: ReadonlyArray<readonly [number, number]>,
) {
  return curve.map((point): [number, number] => [point[0], point[1]]);
}

export function createDemoState(): DemoState {
  return {
    petal: {
      subdivisionsX: PETAL_DEFAULTS.subdivisionsX,
      subdivisionsY: PETAL_DEFAULTS.subdivisionsY,
      height: PETAL_DEFAULTS.height,
      sideProfile: cloneCurve(PETAL_DEFAULTS.sideProfile),
      topProfile: cloneCurve(PETAL_DEFAULTS.topProfile),
    },
    flower: {
      curviness: FLOWER_MODE_DEFAULTS.curviness,
      bloomOpenness: FLOWER_MODE_DEFAULTS.bloomOpenness,
      creaseFrequency: FLOWER_MODE_DEFAULTS.creaseFrequency,
      creaseAmplitude: FLOWER_MODE_DEFAULTS.creaseAmplitude,
      wrinkleFrequency: FLOWER_MODE_DEFAULTS.wrinkleFrequency,
      wrinkleAmplitude: FLOWER_MODE_DEFAULTS.wrinkleAmplitude,
      sizeFalloff: cloneCurve(FLOWER_MODE_DEFAULTS.sizeFalloff),
      widthFalloff: cloneCurve(FLOWER_MODE_DEFAULTS.widthFalloff),
    },
    flowerBase: { ...FLOWER_BASE_DEFAULTS },
    lighting: { ...PETAL_LIGHTING },
    backgroundPetals: { ...FLOWER_STAGE_THREE_BACKGROUND_SETTINGS.defaults },
    simulation: { ...SIMULATION_DEFAULTS },
  };
}
