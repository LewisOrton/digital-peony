import * as THREE from 'three/webgpu';

type RendererHost = {
  app: HTMLElement;
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  dispose(): void;
};

export class WebGpuUnavailableError extends Error {
  constructor() {
    super('WebGPU is unavailable.');
    this.name = 'WebGpuUnavailableError';
  }
}

export async function createRendererHost(): Promise<RendererHost> {
  const app = document.querySelector<HTMLElement>('#app')!;
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    depth: true,
    stencil: false,
    trackTimestamp: false,
    powerPreference: 'high-performance',
  });
  try {
    await renderer.init();
  } catch {
    renderer.dispose();
    throw new WebGpuUnavailableError();
  }
  const webGpuBackend = renderer.backend as THREE.WebGPUBackend & {
    isWebGPUBackend?: boolean;
  };
  if (webGpuBackend.isWebGPUBackend !== true) {
    renderer.dispose();
    throw new WebGpuUnavailableError();
  }
  renderer.setClearColor(0x000000);
  renderer.setPixelRatio(2.0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  app.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeSceneResources(scene);
    scene.clear();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return { app, renderer, scene, dispose };
}

function disposeSceneResources(
  scene: THREE.Scene,
) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      (Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]
      ).forEach((material) => materials.add(material));
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof THREE.Texture) textures.add(value);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
