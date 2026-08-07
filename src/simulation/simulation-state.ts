export type SimulationSettings = {
  turbulenceStrength: number;
  turbulenceScale: number;
  turbulenceSpeed: number;
};

export const SIMULATION_DEFAULTS: Readonly<SimulationSettings> = Object.freeze({
  turbulenceStrength: 1.25,
  turbulenceScale: 0.59,
  turbulenceSpeed: 2,
});
