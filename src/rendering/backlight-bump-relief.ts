import { mix } from 'three/tsl';

export const BACKLIGHT_BUMP_RELIEF = Object.freeze({
  gain: 4.5,
  minimum: 0.1,
  maximum: 2.5,
});

type ScalarNode = any;

export function createBacklightBumpReliefNode({
  smoothVisibleWorldNormalNode,
  bumpVisibleWorldNormalNode,
  lightDirectionNode,
  bumpStrengthNode,
}: {
  smoothVisibleWorldNormalNode: ScalarNode;
  bumpVisibleWorldNormalNode: ScalarNode;
  lightDirectionNode: ScalarNode;
  bumpStrengthNode: ScalarNode;
}) {
  const signedReliefSignal = bumpVisibleWorldNormalNode
    .sub(smoothVisibleWorldNormalNode)
    .dot(lightDirectionNode)
    .negate();
  const relief = signedReliefSignal
    .mul(BACKLIGHT_BUMP_RELIEF.gain)
    .add(1)
    .clamp(
      BACKLIGHT_BUMP_RELIEF.minimum,
      BACKLIGHT_BUMP_RELIEF.maximum,
    );
  return (mix as any)(
    1,
    relief,
    bumpStrengthNode.greaterThan(0).toFloat(),
  );
}
