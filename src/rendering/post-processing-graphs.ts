// @ts-nocheck -- TSL graph nodes are runtime-validated behind the typed export.
import * as THREE from 'three/webgpu';
import {
  abs,
  Fn,
  If,
  float,
  luminance,
  max,
  min,
  rtt,
  screenUV,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

export const GLOW_PIPELINE = Object.freeze({
  resolutionScale: 0.25,
  blurResolutionScale: 0.25,
  softKnee: 0.5,
  gaussianSigma: 4,
  activePassCount: 5,
});

export const CHROMATIC_SPLIT = Object.freeze({
  maximumOffsetShortSide: 0.012,
  randomUpdatesPerSecond: 18,
  minimumAmplitudeRatio: 0.38,
});

type TslNode = any;

export function createGlowGraph({
  sceneColor,
  threshold,
  radius,
}: {
  sceneColor: TslNode;
  threshold: TslNode;
  radius: TslNode;
}) {
  const sourceLuminance: TslNode = luminance(sceneColor);
  const knee: TslNode = float(GLOW_PIPELINE.softKnee);
  const softDistance: TslNode = sourceLuminance
    .sub(threshold)
    .add(knee)
    .clamp(0, GLOW_PIPELINE.softKnee * 2);
  const softContribution: TslNode = softDistance
    .mul(softDistance)
    .div(knee.mul(4));
  const contribution: TslNode = max(
    sourceLuminance.sub(threshold),
    softContribution,
  );
  const extractionScale: TslNode = contribution.div(
    max(sourceLuminance, 0.0001),
  );
  const extractionTexture: TslNode = rtt(
    vec4(sceneColor.rgb.mul(extractionScale), 1),
    null,
    null,
    {
      depthBuffer: false,
      format: THREE.RGBAFormat,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
    },
  );
  extractionTexture.setResolutionScale(GLOW_PIPELINE.resolutionScale);
  extractionTexture.name = 'Glow_extraction';
  extractionTexture.renderTarget.texture.name = 'Glow.Extraction.RGBA16F';
  extractionTexture.renderTarget.texture.colorSpace = THREE.NoColorSpace;
  const blurred: TslNode = gaussianBlur(
    extractionTexture,
    radius,
    GLOW_PIPELINE.gaussianSigma,
    { resolutionScale: GLOW_PIPELINE.blurResolutionScale },
  );
  blurred.name = 'Glow_gaussian';
  blurred._horizontalRT.texture.name = 'Glow.Horizontal.RGBA16F';
  blurred._verticalRT.texture.name = 'Glow.Vertical.RGBA16F';
  blurred._horizontalRT.texture.colorSpace = THREE.NoColorSpace;
  blurred._verticalRT.texture.colorSpace = THREE.NoColorSpace;
  return { extractionTexture, blurred };
}

export function createInteractionRgb({
  sceneColor,
  sceneDepth,
  fieldTexture,
  strength,
  turbulence,
  chromaticity,
  time,
}: {
  sceneColor: TslNode;
  sceneDepth: TslNode;
  fieldTexture: TslNode;
  strength: TslNode;
  turbulence: TslNode;
  chromaticity: TslNode;
  time: TslNode;
}): TslNode {
  return Fn(() => {
    const outputRgb: TslNode = vec3(sceneColor.rgb).toVar();
    If(strength.greaterThan(0), () => {
      const coordinate: TslNode = screenUV;
      const field: TslNode = fieldTexture.sample(coordinate);
      const energy: TslNode = field.z.clamp(0, 1);
      If(energy.greaterThan(0.0001), () => {
        const smoothEnergy: TslNode = energy
          .mul(energy)
          .mul(float(3).sub(energy.mul(2)));
        const localMask: TslNode = smoothEnergy.pow(1.5);
        const fieldStep: TslNode = vec2(0.0035, 0.0035);
        const energyLeft: TslNode = fieldTexture
          .sample(coordinate.sub(vec2(fieldStep.x, 0)))
          .z;
        const energyRight: TslNode = fieldTexture
          .sample(coordinate.add(vec2(fieldStep.x, 0)))
          .z;
        const energyDown: TslNode = fieldTexture
          .sample(coordinate.sub(vec2(0, fieldStep.y)))
          .z;
        const energyUp: TslNode = fieldTexture
          .sample(coordinate.add(vec2(0, fieldStep.y)))
          .z;
        const energyGradient: TslNode = vec2(
          energyRight.sub(energyLeft),
          energyUp.sub(energyDown),
        );
        const curlDirection: TslNode = vec2(
          energyGradient.y.negate(),
          energyGradient.x,
        );
        let domain: TslNode = vec3(
          coordinate.mul(turbulence.mul(8).add(11)),
          time.mul(0.28).add(field.w.mul(6.28318530718)),
        );
        for (let octave = 1; octave <= 5; octave += 1) {
          const frequency = octave * 1.43;
          domain = domain.add(
            domain.yzx
              .mul(frequency)
              .add(time.mul(0.37 + octave * 0.083))
              .sin()
              .div(frequency),
          );
        }
        const primaryFold: TslNode = vec2(
          domain.y.add(domain.z.mul(0.83)).sin(),
          domain.x.sub(domain.z.mul(0.71)).cos(),
        );
        const secondaryFold: TslNode = vec2(
          domain.x.mul(1.73).sub(domain.y.mul(0.61)).sin(),
          domain.y.mul(1.37).add(domain.x.mul(0.47)).cos(),
        );
        const turbulentOffset: TslNode = primaryFold
          .mul(0.68)
          .add(secondaryFold.mul(0.32))
          .add(curlDirection.mul(1.75))
          .mul(turbulence)
          .mul(0.003);
        const edgeDistance: TslNode = min(
          min(coordinate.x, coordinate.y),
          min(coordinate.x.oneMinus(), coordinate.y.oneMinus()),
        );
        const edgeFade: TslNode = edgeDistance.div(0.035).clamp(0, 1);
        const requestedOffset: TslNode = field.xy
          .mul(strength)
          .mul(0.018)
          .add(turbulentOffset)
          .mul(localMask)
          .mul(edgeFade);
        const requestedUv: TslNode = coordinate
          .add(requestedOffset)
          .clamp(0.001, 0.999);
        const depthDifference: TslNode = abs(
          sceneDepth.sample(coordinate).r.sub(
            sceneDepth.sample(requestedUv).r,
          ),
        );
        const depthGate: TslNode = float(1)
          .sub(depthDifference.sub(0.001).div(0.014).clamp(0, 1));
        const offset: TslNode = requestedOffset.mul(depthGate);
        const warpedUv: TslNode = coordinate
          .add(offset)
          .clamp(0.001, 0.999);
        const refracted: TslNode = sceneColor.sample(warpedUv).rgb;
        const baseLuminance: TslNode = max(
          luminance(sceneColor.rgb),
          0.001,
        );
        const warpedLuminance: TslNode = luminance(refracted);
        const displacedLuminanceRatio: TslNode = warpedLuminance
          .div(baseLuminance)
          .clamp(0.55, 1.65);
        const transported: TslNode = sceneColor.rgb.mul(
          float(1).add(
            displacedLuminanceRatio
              .sub(1)
              .mul(localMask)
              .mul(0.9),
          ),
        );
        const fieldEdge: TslNode = energyGradient
          .length()
          .mul(18)
          .clamp(0, 1);
        const leadingGrainX: TslNode = float(1)
          .sub(
            domain.x
              .mul(9.7)
              .add(domain.y.mul(7.3))
              .sub(domain.z.mul(4.9))
              .sin()
              .abs(),
          )
          .pow(5);
        const leadingGrainY: TslNode = float(1)
          .sub(
            domain.y
              .mul(8.9)
              .sub(domain.x.mul(5.1))
              .add(domain.z.mul(6.7))
              .cos()
              .abs(),
          )
          .pow(5);
        const leadingGrain: TslNode = leadingGrainX
          .mul(leadingGrainY)
          .mul(fieldEdge)
          .mul(energy);
        const vertexDotX: TslNode = float(1)
          .sub(
            domain.x
              .mul(2.1)
              .add(domain.z.mul(1.4))
              .sin()
              .abs(),
          );
        const vertexDotY: TslNode = float(1)
          .sub(
            domain.y
              .mul(2.3)
              .sub(domain.z.mul(1.1))
              .cos()
              .abs(),
          );
        const vertexDots: TslNode = vertexDotX
          .mul(vertexDotY)
          .pow(1.35)
          .mul(localMask);
        const foldedPhase: TslNode = domain.x
          .add(domain.y.mul(1.73).add(domain.z.mul(0.91)).sin().mul(2.1))
          .add(domain.x.mul(2.37).sub(domain.y.mul(1.19)).sin().mul(0.9))
          .add(domain.y.mul(3.83).add(domain.x.mul(0.67)).cos().mul(0.42));
        const palettePhase: TslNode = foldedPhase
          .add(energy.mul(5.4))
          .add(field.w.mul(6.28318530718))
          .add(time.mul(0.91));
        const rawSpectralPalette: TslNode = vec3(
          palettePhase.cos(),
          palettePhase.sub(2.09439510239).cos(),
          palettePhase.add(2.09439510239).cos(),
        )
          .mul(0.5)
          .add(0.5)
          .clamp(0, 1);
        const smoothSpectralPalette: TslNode = rawSpectralPalette
          .mul(rawSpectralPalette)
          .mul(rawSpectralPalette.mul(-2).add(3))
          .mul(rawSpectralPalette);
        const spectralPalette: TslNode = vec3(
          smoothSpectralPalette.r
            .mul(0.82)
            .add(smoothSpectralPalette.g.mul(0.08))
            .add(smoothSpectralPalette.b.mul(0.12)),
          smoothSpectralPalette.r
            .mul(0.1)
            .add(smoothSpectralPalette.g.mul(0.82))
            .add(smoothSpectralPalette.b.mul(0.12)),
          smoothSpectralPalette.r
            .mul(0.02)
            .add(smoothSpectralPalette.g.mul(0.46))
            .add(smoothSpectralPalette.b.mul(1.45)),
        ).clamp(0, 1.35);
        const spectralLuminance: TslNode = luminance(spectralPalette);
        const restrainedSpectralPalette: TslNode = vec3(spectralLuminance)
          .mul(0.72)
          .add(spectralPalette.mul(0.28));
        const spectralEnergy: TslNode = restrainedSpectralPalette
          .mul(localMask)
          .mul(chromaticity)
          .mul(strength)
          .mul(0.16);
        const grainEnergy: TslNode = restrainedSpectralPalette
          .mul(leadingGrain)
          .mul(chromaticity)
          .mul(strength)
          .mul(0.32);
        const vertexEnergy: TslNode = restrainedSpectralPalette
          .mul(0.72)
          .add(vec3(0.16, 0.22, 0.28))
          .mul(vertexDots)
          .mul(chromaticity)
          .mul(strength)
          .mul(0.3);
        const effectedRgb: TslNode = transported
          .add(spectralEnergy)
          .add(grainEnergy)
          .add(vertexEnergy);
        outputRgb.assign(effectedRgb);
      });
    });
    return outputRgb;
  })();
}

export function createChromaticSplitRgb({
  sceneColor,
  sceneDepth,
  fieldTexture,
  baseRgb,
  strength,
  time,
  viewportCssPixels,
}: {
  sceneColor: TslNode;
  sceneDepth: TslNode;
  fieldTexture: TslNode;
  baseRgb: TslNode;
  strength: TslNode;
  time: TslNode;
  viewportCssPixels: TslNode;
}): TslNode {
  return Fn(() => {
    const outputRgb: TslNode = baseRgb.toVar();
    If(strength.greaterThan(0), () => {
      const coordinate: TslNode = screenUV;
      const field: TslNode = fieldTexture.sample(coordinate);
      const energy: TslNode = field.z.clamp(0, 1);
      If(energy.greaterThan(0.0001), () => {
        const sourceDepth: TslNode = sceneDepth.sample(coordinate).r;
        If(sourceDepth.lessThan(0.9999), () => {
          const smoothEnergy: TslNode = energy
            .mul(energy)
            .mul(float(3).sub(energy.mul(2)));
          const localMask: TslNode = smoothEnergy.pow(1.5);
          const edgeDistance: TslNode = min(
            min(coordinate.x, coordinate.y),
            min(coordinate.x.oneMinus(), coordinate.y.oneMinus()),
          );
          const edgeFade: TslNode = edgeDistance.div(0.025).clamp(0, 1);
          const mask: TslNode = localMask
            .mul(edgeFade)
            .mul(strength.clamp(0, 1));

          const timeCell: TslNode = time
            .mul(CHROMATIC_SPLIT.randomUpdatesPerSecond);
          const timeIndex: TslNode = timeCell.floor();
          const timeBlendRaw: TslNode = timeCell.fract();
          const timeBlend: TslNode = timeBlendRaw
            .mul(timeBlendRaw)
            .mul(float(3).sub(timeBlendRaw.mul(2)));
          const seededVector = (index: TslNode) => {
            const angle: TslNode = index
              .mul(45.164)
              .add(17.17)
              .sin()
              .mul(43758.5453)
              .fract()
              .mul(Math.PI * 2);
            return vec2(angle.cos(), angle.sin());
          };
          const direction: TslNode = seededVector(timeIndex)
            .mix(seededVector(timeIndex.add(1)), timeBlend)
            .normalize();
          const amplitudeAt = (index: TslNode) => index
            .mul(91.731)
            .add(43.31)
            .cos()
            .mul(24634.6345)
            .fract()
            .mul(1 - CHROMATIC_SPLIT.minimumAmplitudeRatio)
            .add(CHROMATIC_SPLIT.minimumAmplitudeRatio);
          const randomAmplitude: TslNode = amplitudeAt(timeIndex).mix(
            amplitudeAt(timeIndex.add(1)),
            timeBlend,
          );
          const maximumOffsetCssPixels: TslNode = viewportCssPixels.x
            .min(viewportCssPixels.y)
            .mul(CHROMATIC_SPLIT.maximumOffsetShortSide)
            .mul(strength)
            .mul(randomAmplitude);
          const offsetUv: TslNode = direction
            .mul(maximumOffsetCssPixels)
            .div(viewportCssPixels);
          const redUv: TslNode = coordinate
            .add(offsetUv)
            .clamp(0.001, 0.999);
          const blueUv: TslNode = coordinate
            .sub(offsetUv)
            .clamp(0.001, 0.999);
          const sourceRgb: TslNode = sceneColor.rgb;
          const splitRgb: TslNode = vec3(
            sceneColor.sample(redUv).r,
            sourceRgb.g,
            sceneColor.sample(blueUv).b,
          );
          const redDepthGate: TslNode = float(1).sub(
            abs(sceneDepth.sample(redUv).r.sub(sourceDepth))
              .sub(0.001)
              .div(0.014)
              .clamp(0, 1),
          );
          const blueDepthGate: TslNode = float(1).sub(
            abs(sceneDepth.sample(blueUv).r.sub(sourceDepth))
              .sub(0.001)
              .div(0.014)
              .clamp(0, 1),
          );
          const gatedSplit: TslNode = vec3(
            sourceRgb.r.mix(splitRgb.r, redDepthGate),
            sourceRgb.g,
            sourceRgb.b.mix(splitRgb.b, blueDepthGate),
          );
          const aberration: TslNode = gatedSplit.sub(sourceRgb);
          outputRgb.assign(baseRgb.add(aberration.mul(mask)));
        });
      });
    });
    return outputRgb;
  })();
}
