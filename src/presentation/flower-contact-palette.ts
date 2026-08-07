import * as THREE from 'three/webgpu';

export const FLOWER_CONTACT_PALETTE = Object.freeze({
  blueEnd: 0.6,
  orangeEnd: 0.84,
  blue: 0x279bff,
  orange: 0xff7a1a,
  warningRed: 0xff1608,
  materialOrangeDirection: [1, 0.18, 0.02] as const,
  materialWarningDirection: [1, 0.006, 0.002] as const,
  materialWarningColor: [1, 0.018, 0.004] as const,
});

export const FLOWER_CONTACT_HUD_PALETTE = Object.freeze({
  warmStart: 0.6,
  orangeAt: 0.75,
  dangerStart: 0.78,
  dangerAt: 0.9,
  coolBlue: [0.075, 0.28, 0.88] as const,
  saturatedOrange: [1, 0.19, 0.008] as const,
  dangerRed: [1, 0, 0] as const,
  coolHighlight: [0.48, 0.7, 1] as const,
  orangeHighlight: [1, 0.32, 0.04] as const,
  dangerHighlight: [1, 0.008, 0.008] as const,
});

const blue = new THREE.Color(FLOWER_CONTACT_PALETTE.blue);
const orange = new THREE.Color(FLOWER_CONTACT_PALETTE.orange);
const warningRed = new THREE.Color(FLOWER_CONTACT_PALETTE.warningRed);

export function sampleFlowerContactPalette(
  progress: number,
  target = new THREE.Color(),
) {
  const amount = THREE.MathUtils.clamp(progress, 0, 1);
  target.copy(blue);
  if (amount <= FLOWER_CONTACT_PALETTE.blueEnd) return target;
  if (amount <= FLOWER_CONTACT_PALETTE.orangeEnd) {
    return target.lerp(
      orange,
      (amount - FLOWER_CONTACT_PALETTE.blueEnd) /
        (FLOWER_CONTACT_PALETTE.orangeEnd - FLOWER_CONTACT_PALETTE.blueEnd),
    );
  }
  return target.copy(orange).lerp(
    warningRed,
    (amount - FLOWER_CONTACT_PALETTE.orangeEnd) /
      (1 - FLOWER_CONTACT_PALETTE.orangeEnd),
  );
}
