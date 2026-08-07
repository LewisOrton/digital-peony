import * as THREE from 'three/webgpu';

type ComputeNode = any;
type PetalStorageTexture =
  | THREE.StorageTexture
  | THREE.StorageArrayTexture;

export type GpuPetalTextureRecipe = {
  id: string;
  name: string;
  seed: number;
  width: number;
  height: number;
  depth?: number;
  anisotropy: number;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  packedSignals: readonly string[];
  createComputeNode(texture: PetalStorageTexture): ComputeNode;
};

export type GpuPetalTextureBatch = {
  textures: ReadonlyMap<string, PetalStorageTexture>;
  texture(id: string): PetalStorageTexture;
  rebake(id: string): void;
  dispose(): void;
};

export function bakePetalTextureBatch(
  renderer: THREE.WebGPURenderer,
  recipes: readonly GpuPetalTextureRecipe[],
): GpuPetalTextureBatch {
  if (recipes.length === 0) {
    throw new Error('GPU petal texture batch requires at least one recipe.');
  }
  const ids = new Set<string>();
  const textures = new Map<string, PetalStorageTexture>();
  const computeNodesById = new Map<string, ComputeNode>();
  const computeNodes: ComputeNode[] = [];
  let disposed = false;

  try {
    for (const recipe of recipes) {
      if (ids.has(recipe.id)) {
        throw new Error(`Duplicate GPU petal texture recipe: ${recipe.id}`);
      }
      ids.add(recipe.id);
      const depth = recipe.depth ?? 1;
      const texture = depth > 1
        ? new THREE.StorageArrayTexture(
            recipe.width,
            recipe.height,
            depth,
          )
        : new THREE.StorageTexture(recipe.width, recipe.height);
      texture.name = recipe.name;
      texture.format = THREE.RGBAFormat;
      texture.type = THREE.UnsignedByteType;
      texture.wrapS = recipe.wrapS ?? THREE.RepeatWrapping;
      texture.wrapT = recipe.wrapT ?? THREE.RepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = recipe.anisotropy;
      texture.generateMipmaps = true;
      (texture as any).mipmapsAutoUpdate = true;
      texture.colorSpace = THREE.NoColorSpace;
      textures.set(recipe.id, texture);
      const computeNode = recipe.createComputeNode(texture);
      computeNodes.push(computeNode);
      computeNodesById.set(recipe.id, computeNode);
    }

    renderer.compute(computeNodes);

    return {
      textures,
      texture(id: string) {
        const texture = textures.get(id);
        if (!texture) {
          throw new Error(`Unknown GPU petal texture: ${id}`);
        }
        return texture;
      },
      rebake(id: string) {
        const computeNode = computeNodesById.get(id);
        if (!computeNode) {
          throw new Error(`Unknown GPU petal bake: ${id}`);
        }
        renderer.compute(computeNode);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        computeNodes.forEach((node) => node.dispose());
        textures.forEach((texture) => texture.dispose());
        computeNodes.length = 0;
        computeNodesById.clear();
        textures.clear();
      },
    };
  } catch (error) {
    computeNodes.forEach((node) => node.dispose());
    textures.forEach((texture) => texture.dispose());
    throw error;
  }
}
