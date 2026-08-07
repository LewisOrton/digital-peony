export type PetalGradientStop = {
  position: number;
  color: number;
};

export const PETAL_LOOKDEV = {
  colorStops: [
    { position: 0, color: 0xdde5a6 },
    { position: 0.4, color: 0xff7c9c },
    { position: 0.86, color: 0xffaac5 },
    { position: 1, color: 0xffebe6 },
  ],
  gradient: {
    outnessShift: 0.11,
    boundaryLowNoise: 0.02,
    boundaryMidNoise: 0.008,
  },
  albedo: {
    lowFrequencyU: 1.35,
    lowFrequencyV: 1.8,
    midFrequencyU: 3.6,
    midFrequencyV: 4.6,
    lowSeedU: 3.1,
    lowSeedV: 2.3,
    midSeedU: 5.7,
    midSeedV: 4.1,
    brightnessBase: 1.04,
    brightnessLow: 0.24,
    brightnessMid: 0.1,
    chroma: 0.2,
  },
  overlay: {
    primaryFrequencyU: 7,
    primaryFrequencyV: 1.75,
    secondaryFrequencyU: 14,
    secondaryFrequencyV: 3.5,
    tertiaryFrequencyU: 28,
    tertiaryFrequencyV: 7,
    primarySeedU: 11.3,
    primarySeedV: 7.9,
    secondarySeedU: 19.7,
    secondarySeedV: 13.1,
    tertiarySeedU: 29.9,
    tertiarySeedV: 23.3,
    primaryWeight: 0.3,
    secondaryWeight: 0.3,
    tertiaryWeight: 0.4,
    brightness: 0.1,
    chroma: 0.025,
  },
  surfaceVariation: {
    frequencyU: 1.7,
    frequencyV: 2.2,
    seedU: 3.1,
    seedV: 2.3,
  },
  transmission: {
    minimum: 0.8,
    maximum: 1.14,
    openAreaGain: 0.09,
  },
  roughness: {
    base: 0.07,
    variation: 0.005,
    minimum: 0.07,
    maximum: 0.36,
  },
  reflectance: {
    ior: 1.7,
  },
  seed: {
    indexScale: 12.9898,
    hashScale: 43758.5453,
  },
} as const;
