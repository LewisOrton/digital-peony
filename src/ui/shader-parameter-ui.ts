import {
  PETAL_LOOKDEV,
  type PetalGradientStop,
} from '../rendering/petal-lookdev-contract';

const GRADIENT_STOP_GAP = 0.01;

function colorHex(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function createShaderPanel(
  onGradientStopsChange: (stops: PetalGradientStop[]) => void,
) {
  const gradientStops: PetalGradientStop[] =
    PETAL_LOOKDEV.colorStops.map((stop) => ({ ...stop }));
  const displayedStops = gradientStops.map((_, displayIndex) => ({
    displayIndex,
    stopIndex: gradientStops.length - 1 - displayIndex,
  }));
  const panel = document.createElement('section');
  panel.className = 'petal-gradient-control';
  panel.innerHTML = `
    <div class="petal-gradient-preview" data-gradient-preview></div>
    <div class="petal-gradient-stops">
      ${displayedStops.map(({ displayIndex, stopIndex }) => `
        <label class="petal-gradient-stop">
          <span>Stop ${displayIndex + 1}</span>
          <input type="color" value="${colorHex(gradientStops[stopIndex].color)}" aria-label="Gradient stop ${displayIndex + 1} color" data-gradient-color="${stopIndex}">
          <input type="range" min="0" max="1" step="0.01" value="${1 - gradientStops[stopIndex].position}" aria-label="Gradient stop ${displayIndex + 1} position" data-gradient-position="${stopIndex}">
          <output data-gradient-position-value="${stopIndex}">${(1 - gradientStops[stopIndex].position).toFixed(2)}</output>
        </label>
      `).join('')}
    </div>
  `;
  const gradientPreview = panel.querySelector<HTMLElement>(
    '[data-gradient-preview]',
  )!;
  const gradientColorInputs = Array.from(
    panel.querySelectorAll<HTMLInputElement>('[data-gradient-color]'),
  );
  const gradientPositionInputs = Array.from(
    panel.querySelectorAll<HTMLInputElement>('[data-gradient-position]'),
  );
  const gradientPositionOutputs = Array.from(
    panel.querySelectorAll<HTMLOutputElement>(
      '[data-gradient-position-value]',
    ),
  );

  function renderGradient() {
    gradientPreview.style.background = `linear-gradient(90deg, ${gradientStops
      .slice()
      .reverse()
      .map(
        (stop) =>
          `${colorHex(stop.color)} ${(1 - stop.position) * 100}%`,
      )
      .join(', ')})`;
    gradientPositionInputs.forEach((input, displayIndex) => {
      const stopIndex = Number(input.dataset.gradientPosition);
      const displayPosition = 1 - gradientStops[stopIndex].position;
      const previous = displayedStops[displayIndex - 1];
      const next = displayedStops[displayIndex + 1];
      input.min = String(
        previous
          ? 1 - gradientStops[previous.stopIndex].position + GRADIENT_STOP_GAP
          : 0,
      );
      input.max = String(
        next
          ? 1 - gradientStops[next.stopIndex].position - GRADIENT_STOP_GAP
          : 1,
      );
      input.value = String(displayPosition);
      gradientPositionOutputs[displayIndex].value = displayPosition.toFixed(2);
    });
  }

  function publishGradient() {
    renderGradient();
    onGradientStopsChange(gradientStops.map((stop) => ({ ...stop })));
  }

  gradientColorInputs.forEach((input) => {
    input.addEventListener('input', () => {
      const stopIndex = Number(input.dataset.gradientColor);
      gradientStops[stopIndex].color = Number.parseInt(input.value.slice(1), 16);
      publishGradient();
    });
  });
  gradientPositionInputs.forEach((input) => {
    input.addEventListener('input', () => {
      const stopIndex = Number(input.dataset.gradientPosition);
      gradientStops[stopIndex].position = 1 - input.valueAsNumber;
      publishGradient();
    });
  });
  renderGradient();
  return { element: panel };
}
