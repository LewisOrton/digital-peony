export const GITHUB_REPOSITORY_URL =
  'https://github.com/LewisOrton/digital-peony';

export function createGithubSignature() {
  const element = document.createElement('a');
  element.className = 'github-signature';
  element.href = GITHUB_REPOSITORY_URL;
  element.target = '_blank';
  element.rel = 'noopener noreferrer';
  element.setAttribute(
    'aria-label',
    'Open LewisOrton/digital-peony on GitHub',
  );
  element.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.84 1.23 1.84 1.23 1.07 1.84 2.8 1.31 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.65.24 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z"></path>
    </svg>
    <span>LewisOrton</span>
  `;
  return element;
}
