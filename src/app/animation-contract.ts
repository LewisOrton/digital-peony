import type * as THREE from 'three/webgpu';

export type FrameContext = {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  timestamp: number;
};

export interface FrameParticipant {
  update(context: FrameContext): void;
  dispose(): void;
}

export function createFrameTaskCoalescer(
  task: () => void,
  scheduleFrame: (callback: FrameRequestCallback) => number =
    window.requestAnimationFrame.bind(window),
  cancelFrame: (handle: number) => void =
    window.cancelAnimationFrame.bind(window),
) {
  let pendingFrame: number | null = null;
  let disposed = false;

  function request() {
    if (disposed || pendingFrame !== null) return;
    pendingFrame = scheduleFrame(() => {
      pendingFrame = null;
      if (!disposed) task();
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (pendingFrame !== null) cancelFrame(pendingFrame);
    pendingFrame = null;
  }

  return { request, dispose };
}

export function createFrameParticipantRegistry() {
  const participants = new Set<FrameParticipant>();
  let disposed = false;

  function add(participant: FrameParticipant) {
    participants.add(participant);
  }

  function update(context: FrameContext) {
    participants.forEach((participant) => participant.update(context));
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    [...participants].reverse().forEach((participant) => {
      participant.dispose();
    });
    participants.clear();
  }

  return { add, update, dispose };
}
