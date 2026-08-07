import { createGithubSignature } from './github-signature';

export function showWebGpuUnavailable() {
  const loader = document.querySelector<HTMLElement>('[data-peony-loader]')!;
  const iphoneChrome = /iPhone/.test(navigator.userAgent) &&
    /CriOS/.test(navigator.userAgent);
  const title = iphoneChrome ? 'Open in Safari' : 'WebGPU required';
  const description = iphoneChrome
    ? 'Chrome on this iPhone cannot run the WebGPU experience. Please open Digital Peony in Safari.'
    : 'Digital Peony needs a recent WebGPU-enabled browser and device.';
  const content = document.createElement('section');
  content.className = 'webgpu-unavailable';
  content.setAttribute('aria-labelledby', 'webgpu-unavailable-title');
  content.innerHTML = `
    <div class="webgpu-unavailable-petal" aria-hidden="true"></div>
    <h1 id="webgpu-unavailable-title">${title}</h1>
    <p>${description}</p>
  `;
  const githubLink = createGithubSignature();
  githubLink.classList.add('webgpu-unavailable-github');
  githubLink.querySelector('span')!.textContent = 'View project on GitHub';
  content.append(githubLink);
  loader.replaceChildren(content);
  loader.dataset.state = 'unsupported';
  loader.removeAttribute('aria-hidden');
}
