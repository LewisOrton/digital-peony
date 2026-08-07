import * as THREE from 'three/webgpu';
import type { FlowerBaseSettings } from '../geometry/flower-base';
import { PETAL_GEOMETRY } from '../geometry/geometry-contract';
import {
  BLOOM_OPENNESS,
  type FlowerModeSettings,
} from '../geometry/flower-mode';

export function createFlowerBasePanel(
  settings: FlowerBaseSettings,
  onChange: () => void,
  onCommit: () => void,
) {
  const panel = document.createElement('section');
  panel.className = 'flower-base-control';
  panel.innerHTML = `
    <div class="flower-base-inputs">
      <label>
        <span>Petal Count</span>
        <input type="range" min="1" max="${PETAL_GEOMETRY.flowerCapacity.maximumPetals}" step="1" value="${settings.anchorCount}" data-flower-setting="anchorCount">
        <output data-flower-value="anchorCount">${settings.anchorCount}</output>
      </label>
    </div>
  `;

  const inputs = Array.from(
    panel.querySelectorAll<HTMLInputElement>('[data-flower-setting]'),
  );
  const values = Array.from(
    panel.querySelectorAll<HTMLOutputElement>('[data-flower-value]'),
  );

  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      const value = Math.round(input.valueAsNumber);
      settings.anchorCount = value;
      values[0].value = String(value);
      onChange();
    });
    input.addEventListener('change', onCommit);
  });

  return { element: panel };
}

export function createFlowerModePanel(
  settings: FlowerModeSettings,
  onBloomOpennessChange: () => void,
  onUniformChange: (key: 'curviness') => void,
  onCommit: () => void,
) {
  const panel = document.createElement('aside');
  panel.className = 'petal-mode-panel flower-mode-panel';
  panel.innerHTML = `
    <section class="flower-curviness-control">
      <div class="flower-base-inputs">
        <label>
          <span>Curviness</span>
          <input type="range" min="0" max="1" step="0.01" value="${settings.curviness}" data-flower-curviness>
          <output data-flower-curviness-value>${settings.curviness.toFixed(2)}</output>
        </label>
      </div>
    </section>
    <section class="flower-bloom-control">
      <div class="flower-base-inputs">
        <label>
          <span>Bloom Openness</span>
          <input type="range" min="${THREE.MathUtils.radToDeg(BLOOM_OPENNESS.minimumRadians)}" max="${THREE.MathUtils.radToDeg(BLOOM_OPENNESS.maximumRadians)}" step="${THREE.MathUtils.radToDeg(BLOOM_OPENNESS.stepRadians)}" value="${THREE.MathUtils.radToDeg(settings.bloomOpenness)}" data-flower-bloom-openness>
          <output data-flower-bloom-openness-value>${formatBloomOpenness(settings.bloomOpenness)}</output>
        </label>
      </div>
    </section>
  `;

  const curvinessInput = panel.querySelector<HTMLInputElement>(
    '[data-flower-curviness]',
  )!;
  const curvinessValue = panel.querySelector<HTMLOutputElement>(
    '[data-flower-curviness-value]',
  )!;
  const bloomOpennessInput = panel.querySelector<HTMLInputElement>(
    '[data-flower-bloom-openness]',
  )!;
  const bloomOpennessValue = panel.querySelector<HTMLOutputElement>(
    '[data-flower-bloom-openness-value]',
  )!;
  function render() {
    curvinessInput.value = String(settings.curviness);
    curvinessValue.value = settings.curviness.toFixed(2);
    bloomOpennessInput.value = String(
      THREE.MathUtils.radToDeg(settings.bloomOpenness),
    );
    bloomOpennessValue.value = formatBloomOpenness(
      settings.bloomOpenness,
    );
  }

  curvinessInput.addEventListener('input', () => {
    settings.curviness = curvinessInput.valueAsNumber;
    render();
    onUniformChange('curviness');
  });
  curvinessInput.addEventListener('change', onCommit);
  bloomOpennessInput.addEventListener('input', () => {
    settings.bloomOpenness = THREE.MathUtils.degToRad(
      bloomOpennessInput.valueAsNumber,
    );
    render();
    onBloomOpennessChange();
  });
  bloomOpennessInput.addEventListener('change', onCommit);

  render();
  return { element: panel };
}

function formatBloomOpenness(opennessRadians: number) {
  const degrees = Math.round(THREE.MathUtils.radToDeg(opennessRadians));
  return `${degrees > 0 ? '+' : ''}${degrees}°`;
}
