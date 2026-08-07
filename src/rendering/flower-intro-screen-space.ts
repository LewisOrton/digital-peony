export const FLOWER_INTRO_SCREEN_SPACE = {
  referenceShortAxisCssPixels: 390,
  referenceRenderPixelsPerCssPixel: 2,
  minimumViewportScale: 1,
  maximumViewportScale: 1.65,
} as const;

export type FlowerIntroScreenSpaceMetrics = {
  cssShortAxisPixels: number;
  renderPixelsPerCssPixel: number;
  viewportScale: number;
  shaderPixelScale: number;
};

export function flowerIntroScreenSpaceMetrics(
  cssWidth: number,
  cssHeight: number,
  renderWidth: number,
  renderHeight: number,
): FlowerIntroScreenSpaceMetrics {
  const cssShortAxisPixels = Math.max(
    1,
    Math.min(cssWidth, cssHeight),
  );
  const renderShortAxisPixels = Math.max(
    1,
    Math.min(renderWidth, renderHeight),
  );
  const renderPixelsPerCssPixel =
    renderShortAxisPixels / cssShortAxisPixels;
  const viewportScale = Math.min(
    FLOWER_INTRO_SCREEN_SPACE.maximumViewportScale,
    Math.max(
      FLOWER_INTRO_SCREEN_SPACE.minimumViewportScale,
      Math.sqrt(
        cssShortAxisPixels /
          FLOWER_INTRO_SCREEN_SPACE.referenceShortAxisCssPixels,
      ),
    ),
  );
  return {
    cssShortAxisPixels,
    renderPixelsPerCssPixel,
    viewportScale,
    shaderPixelScale:
      (renderPixelsPerCssPixel /
        FLOWER_INTRO_SCREEN_SPACE.referenceRenderPixelsPerCssPixel) *
      viewportScale,
  };
}
