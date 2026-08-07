import { createPeonyApp } from './app/app';
import { WebGpuUnavailableError } from './rendering/renderer-lifecycle';
import { showWebGpuUnavailable } from './ui/webgpu-unavailable';

let app: Awaited<ReturnType<typeof createPeonyApp>> | null = null;
try {
  app = await createPeonyApp();
} catch (error) {
  if (!(error instanceof WebGpuUnavailableError)) throw error;
  showWebGpuUnavailable();
}
let disposed = false;

function dispose() {
  if (disposed) return;
  disposed = true;
  app?.dispose();
}

window.addEventListener('pagehide', dispose, { once: true });
import.meta.hot?.dispose(dispose);
