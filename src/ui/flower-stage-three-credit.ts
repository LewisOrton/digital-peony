import type { FlowerStageThreePhase } from '../presentation/flower-stage-three';
import { GITHUB_REPOSITORY_URL } from './github-signature';

const CREDIT_DELAY_MILLISECONDS = 3000;
const CREDIT_EXIT_DURATION_MILLISECONDS = 275;
const CREDIT_EXIT_CLEAR_DELAY_MILLISECONDS =
  CREDIT_EXIT_DURATION_MILLISECONDS + 80;
const BEHANCE_PROFILE_URL = 'https://www.behance.net/LewisOrton';
const X_PROFILE_URL = 'https://x.com/mumblinglewis';
const INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/lewisorton/';

type CreditState = 'hidden' | 'entering' | 'visible' | 'exiting';

function createFlowerStageThreeCreditPresentation() {
  const element = document.createElement('aside');
  element.className = 'flower-stage-three-credit';
  element.setAttribute('role', 'dialog');
  element.setAttribute(
    'aria-label',
    'Digital Peony project information',
  );

  const content = document.createElement('div');
  content.className = 'flower-stage-three-credit-content';
  content.innerHTML = `
    <button
      class="flower-stage-three-credit-close"
      type="button"
      aria-label="Close project information"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18"></path>
      </svg>
    </button>
    <p class="flower-stage-three-credit-kicker">Open source on GitHub.</p>
    <h1>Digital Peony</h1>
    <div class="flower-stage-three-credit-description">
      <p>
        Digital Peony is an interactive procedural artwork that generates,
        simulates, and renders an expressive flower entirely in real time.
      </p>
      <p>
        Built with Three.js, WebGPU, and TSL in a compressed production payload
        under 250 KB.
      </p>
    </div>
    <div class="flower-stage-three-credit-meta">
      <a
        class="flower-stage-three-credit-link"
        href="${GITHUB_REPOSITORY_URL}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="LewisOrton on GitHub"
      >
        <svg
          class="flower-stage-three-credit-link-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"></path>
        </svg>
        <span>LewisOrton</span>
      </a>
      <nav
        class="flower-stage-three-credit-socials"
        aria-label="LewisOrton social profiles"
      >
        <a
          class="flower-stage-three-credit-social-link"
          href="${BEHANCE_PROFILE_URL}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LewisOrton on Behance"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g transform="translate(-5.4 -3.75) scale(1.22 1.4)">
              <path d="M4.5 4.5h6.3c2.75 0 4.35 1.35 4.35 3.45 0 1.2-.58 2.2-1.6 2.8 1.35.55 2.15 1.6 2.15 3.08 0 2.35-1.88 4.17-5.02 4.17H4.5V4.5Zm2.9 2.38v2.78h2.95c1.18 0 1.88-.5 1.88-1.4 0-.9-.7-1.38-1.88-1.38H7.4Zm0 5.05v3.7h3.2c1.35 0 2.12-.7 2.12-1.85 0-1.16-.77-1.85-2.12-1.85H7.4Zm9.33-7.43h4.55v1.3h-4.55V4.5Zm-2.05 8.62c0-2.82 1.9-4.78 4.7-4.78 2.72 0 4.58 1.85 4.58 4.7v.82h-6.62c.2 1.16.98 1.8 2.17 1.8.94 0 1.63-.35 2.12-1.03l2.06 1.18c-.92 1.32-2.3 2-4.23 2-2.85 0-4.78-1.88-4.78-4.7Zm2.72-1.15h3.8c-.23-.9-.88-1.38-1.82-1.38-.94 0-1.63.48-1.98 1.38Z"></path>
            </g>
          </svg>
        </a>
        <a
          class="flower-stage-three-credit-social-link"
          href="${X_PROFILE_URL}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LewisOrton on X, mumblinglewis"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g transform="translate(1.2 0) scale(0.9 1)">
              <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z"></path>
            </g>
          </svg>
        </a>
        <a
          class="flower-stage-three-credit-social-link"
          href="${INSTAGRAM_PROFILE_URL}"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="LewisOrton on Instagram"
        >
          <svg
            class="flower-stage-three-credit-social-icon-stroke"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <g transform="translate(-0.72 -0.72) scale(1.06)">
              <rect x="3.5" y="3.5" width="17" height="17" rx="5"></rect>
              <circle cx="12" cy="12" r="4"></circle>
              <circle class="flower-stage-three-credit-social-icon-dot" cx="17.5" cy="6.5" r="1"></circle>
            </g>
          </svg>
        </a>
      </nav>
    </div>
  `;
  element.append(content);

  content.addEventListener('click', (event) => {
    event.stopPropagation();
  });
  element.addEventListener('click', (event) => {
    if (event.target === element) reset();
  });
  content
    .querySelector<HTMLButtonElement>('.flower-stage-three-credit-close')!
    .addEventListener('click', () => reset());

  let enterTimestamp: number | null = null;
  let state: CreditState = 'hidden';
  let exitTimeout: number | null = null;

  function clearExitTimeout() {
    if (exitTimeout === null) return;
    window.clearTimeout(exitTimeout);
    exitTimeout = null;
  }

  function setState(nextState: CreditState) {
    state = nextState;
    element.hidden = nextState === 'hidden';
    element.dataset.state = nextState;
    element.setAttribute(
      'aria-hidden',
      String(nextState !== 'visible'),
    );
  }

  function clear() {
    clearExitTimeout();
    enterTimestamp = null;
    setState('hidden');
  }

  function begin(timestamp: number) {
    clearExitTimeout();
    enterTimestamp = timestamp;
    setState('hidden');
  }

  function reveal() {
    if (state !== 'hidden') return;
    setState('entering');
    window.requestAnimationFrame(() => {
      if (state === 'entering') setState('visible');
    });
  }

  function update(timestamp: number, phase: FlowerStageThreePhase) {
    if (phase === 'interactive' || phase === 'returning') {
      reset();
      return;
    }
    if (
      enterTimestamp !== null &&
      timestamp - enterTimestamp >= CREDIT_DELAY_MILLISECONDS
    ) {
      reveal();
    }
  }

  function reset() {
    enterTimestamp = null;
    if (state === 'hidden' || state === 'exiting') return;
    setState('exiting');
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      clear();
      return;
    }
    clearExitTimeout();
    exitTimeout = window.setTimeout(
      clear,
      CREDIT_EXIT_CLEAR_DELAY_MILLISECONDS,
    );
  }

  setState('hidden');

  return {
    element,
    begin,
    update,
    reset,
  };
}

export function createFlowerStageThreeCredit(host: HTMLElement) {
  let presentation: ReturnType<
    typeof createFlowerStageThreeCreditPresentation
  > | null = null;

  function mount() {
    presentation = createFlowerStageThreeCreditPresentation();
    host.append(presentation.element);
    return presentation;
  }

  return {
    begin(timestamp: number) {
      (presentation ?? mount()).begin(timestamp);
    },
    update(timestamp: number, phase: FlowerStageThreePhase) {
      presentation?.update(timestamp, phase);
    },
    reset() {
      presentation?.reset();
    },
    dispose() {
      presentation?.element.remove();
      presentation = null;
    },
  };
}
