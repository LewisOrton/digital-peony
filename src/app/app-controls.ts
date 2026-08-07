import {
  createFlowerBasePanel,
  createFlowerModePanel,
} from '../ui/flower-parameter-ui';
import {
  createMobileParameterDrawerToggle,
} from '../ui/view-controls-ui';
import { createShaderPanel } from '../ui/shader-parameter-ui';
import type { PetalGradientStop } from '../rendering/petal-lookdev-contract';
import type { DemoState } from '../state/state';

export type AppActions = {
  updateFlowerPlacement(): void;
  updateFlowerShape(): void;
  updateFlowerRestState(): void;
  updateFlowerBase(): void;
  updatePetalGradient(stops: PetalGradientStop[]): void;
};

export function createAppControls(
  app: HTMLElement,
  state: DemoState,
  actions: AppActions,
) {
  const flowerModePanel = createFlowerModePanel(
    state.flower,
    actions.updateFlowerPlacement,
    actions.updateFlowerShape,
    actions.updateFlowerRestState,
  );
  const flowerBasePanel = createFlowerBasePanel(
    state.flowerBase,
    actions.updateFlowerBase,
    actions.updateFlowerRestState,
  );
  const shaderPanel = createShaderPanel(actions.updatePetalGradient);

  flowerModePanel.element.append(
    flowerBasePanel.element,
    shaderPanel.element,
  );
  const parameterEditor = document.createElement('div');
  parameterEditor.className = 'parameter-editor';
  parameterEditor.dataset.revealed = 'false';
  parameterEditor.setAttribute('inert', '');
  parameterEditor.setAttribute('aria-hidden', 'true');
  const parameterDrawerContent = document.createElement('div');
  parameterDrawerContent.className = 'parameter-drawer-content';
  parameterDrawerContent.append(flowerModePanel.element);
  const parameterDrawerToggle =
    createMobileParameterDrawerToggle(
      parameterEditor,
      parameterDrawerContent,
    );
  parameterEditor.append(
    parameterDrawerToggle,
    parameterDrawerContent,
  );
  app.append(parameterEditor);

  return {
    reveal() {
      parameterEditor.getBoundingClientRect();
      parameterEditor.dataset.revealed = 'true';
      parameterEditor.removeAttribute('inert');
      parameterEditor.removeAttribute('aria-hidden');
    },
    dispose() {
      parameterEditor.remove();
    },
  };
}
