export type FlowerStageThreeBackgroundSettings = {
  petalSize: number;
  petalCount: number;
  windStrength: number;
  windSpeed: number;
  windNoiseScale: number;
  brightness: number;
};

export const FLOWER_STAGE_THREE_BACKGROUND_SETTINGS = Object.freeze({
  defaults: Object.freeze<FlowerStageThreeBackgroundSettings>({
    petalSize: 2,
    petalCount: 52,
    windStrength: 2.15,
    windSpeed: 0.4,
    windNoiseScale: 0.5,
    brightness: 2,
  }),
  maximumDensity: 80,
});

export const FLOWER_STAGE_THREE_BACKGROUND_MAX_PETALS = 600;
