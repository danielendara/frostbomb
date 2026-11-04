import * as THREE from "three";
import type { QualityTier } from "./quality";

/** PMREM face size for `fromScene` (LITE uses a smaller target). */
export const ENV_PMREM_SIZE: Readonly<Record<QualityTier, number>> = {
  rich: 256,
  lite: 128,
};

export interface SceneEnvironmentHandle {
  readonly texture: THREE.Texture;
  dispose: () => void;
}

/** A few emissive planes — cold studio IBL without pulling in RoomEnvironment. */
export function createColdStudioScene(): THREE.Scene {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x02060f);

  const panelMaterial = (hex: number) =>
    new THREE.MeshBasicMaterial({ color: hex, side: THREE.BackSide });

  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), panelMaterial(0x0a1428));
  envScene.add(room);

  const keyPanel = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), panelMaterial(0xd8ecff));
  keyPanel.position.set(0, 4, -8);
  keyPanel.rotation.y = Math.PI;
  envScene.add(keyPanel);

  const fillPanel = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), panelMaterial(0x6a9fd8));
  fillPanel.position.set(-10, 2, 6);
  fillPanel.rotation.y = -Math.PI / 3;
  envScene.add(fillPanel);

  const rimPanel = new THREE.Mesh(new THREE.PlaneGeometry(8, 12), panelMaterial(0xbfe4ff));
  rimPanel.position.set(12, 0, 4);
  rimPanel.rotation.y = Math.PI / 2.5;
  envScene.add(rimPanel);

  return envScene;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose?.();
  });
}

/**
 * Procedural studio IBL baked to a PMREM once per build.
 * Call only after the first painted frame (not on the first-frame path).
 */
export function buildSceneEnvironment(
  renderer: THREE.WebGLRenderer,
  tier: QualityTier,
): SceneEnvironmentHandle {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileCubemapShader();

  const studio = createColdStudioScene();
  const target = pmremGenerator.fromScene(studio, 0.04, 0.1, 100, { size: ENV_PMREM_SIZE[tier] });
  disposeObject3D(studio);
  pmremGenerator.dispose();

  return {
    texture: target.texture,
    dispose: () => {
      target.dispose();
    },
  };
}
