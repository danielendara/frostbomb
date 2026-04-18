import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BuildResult } from './geometry';

export interface Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  flakeHolder: THREE.Group;
  start: () => void;
  dispose: () => void;
  isBloomEnabled: boolean;
  isAutoRotateEnabled: boolean;
  setBloom: (enabled: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
  updateFlake: (data: BuildResult) => void;
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050912, 0.06);

  const camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x050912, 1);

  // Lights
  const ambient = new THREE.AmbientLight(0x1a2a4a, 0.5);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(5, 8, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xb0d5ff, 2.5);
  rimLight.position.set(-8, -5, 2);
  scene.add(rimLight);

  const glint1 = new THREE.PointLight(0xffffff, 1.5, 15);
  glint1.position.set(-2, 3, 4);
  scene.add(glint1);

  const glint2 = new THREE.PointLight(0x9ec9ff, 1.2, 15);
  glint2.position.set(4, -2, 3);
  scene.add(glint2);

  const flakeHolder = new THREE.Group();
  scene.add(flakeHolder);

  // Shared material
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    metalness: 0,
    roughness: 0.15,
    transmission: 0.85,
    thickness: 0.5,
    ior: 1.31,
    reflectivity: 0.5,
    transparent: true,
    opacity: 0.9,
    emissive: new THREE.Color('#e0f0ff'),
    emissiveIntensity: 0.25,
  });

  const branchGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  const coreGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

  let branchMesh: THREE.InstancedMesh | null = null;
  const coreMesh = new THREE.Mesh(coreGeom, material);
  let currentFlakeData: BuildResult | null = null;

  // Post-processing
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8,
    0.5,
    0.9,
  );
  composer.addPass(bloomPass);

  // Interaction
  let isAutoRotate = true;
  let isDragging = false;
  const rotation = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  canvas.style.cursor = 'grab';

  window.addEventListener('pointermove', (e) => {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 0.3;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
    if (isDragging) {
      targetRotation.y += (e.movementX || 0) * 0.01;
      targetRotation.x += (e.movementY || 0) * 0.01;
    }
  });

  canvas.addEventListener('pointerdown', () => {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('pointerup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  });

  let frameId = 0;
  let time = 0;
  let entryProgress = 0;

  const dummy = new THREE.Object3D();

  const sceneInterface: Scene = {
    scene,
    camera,
    renderer,
    composer,
    flakeHolder,
    isBloomEnabled: true,
    isAutoRotateEnabled: true,
    start: () => {
      entryProgress = 0;
      animate();
    },
    dispose: () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      composer.dispose();
      branchGeom.dispose();
      coreGeom.dispose();
      material.dispose();
    },
    setBloom: (enabled: boolean) => {
      bloomPass.enabled = enabled;
      sceneInterface.isBloomEnabled = enabled;
    },
    setAutoRotate: (enabled: boolean) => {
      isAutoRotate = enabled;
      sceneInterface.isAutoRotateEnabled = enabled;
      if (!enabled) {
        rotation.x = targetRotation.x;
        rotation.y = targetRotation.y;
      }
    },
    updateFlake: (data: BuildResult) => {
      // Clear old
      if (branchMesh) {
        flakeHolder.remove(branchMesh);
      }

      currentFlakeData = data;
      entryProgress = 0;

      // Create new branch mesh
      branchMesh = new THREE.InstancedMesh(
        branchGeom,
        material,
        data.instances.length
      );
      flakeHolder.add(branchMesh);

      // Reset and add core if not present
      if (!flakeHolder.children.includes(coreMesh)) {
        flakeHolder.add(coreMesh);
      }
    }
  };

  function animate() {
    frameId = requestAnimationFrame(animate);
    time += 0.005;

    if (entryProgress < 1) {
      entryProgress = Math.min(1, entryProgress + 0.008);
    }
    const eased = easeOutExpo(entryProgress);

    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;
    rotation.x += (targetRotation.x - rotation.x) * 0.1;
    rotation.y += (targetRotation.y - rotation.y) * 0.1;

    const autoZ = isAutoRotate ? time * 0.08 + Math.sin(time * 0.3) * 0.04 : 0;
    const autoY = isAutoRotate ? Math.sin(time * 0.2) * 0.05 : 0;
    const autoX = isAutoRotate ? Math.cos(time * 0.25) * 0.03 : 0;

    flakeHolder.rotation.z = autoZ;
    flakeHolder.rotation.y = rotation.y + mouse.x * 0.4 + autoY;
    flakeHolder.rotation.x = rotation.x - mouse.y * 0.3 + autoX;

    // Update instances
    if (branchMesh && currentFlakeData) {
      for (let i = 0; i < currentFlakeData.instances.length; i++) {
        const data = currentFlakeData.instances[i];
        const delay = data.dist * 0.15 + data.depth * 0.1;
        const progress = Math.max(0, Math.min(1, (entryProgress * 1.5 - delay) * 2));
        const s = easeOutExpo(progress);

        dummy.position.set(...data.position);
        dummy.rotation.set(...data.rotation);
        dummy.scale.set(data.scale[0] * s, data.scale[1] * s, data.scale[2] * s);
        dummy.updateMatrix();
        branchMesh.setMatrixAt(i, dummy.matrix);
      }
      branchMesh.instanceMatrix.needsUpdate = true;
    }

    if (coreMesh && currentFlakeData) {
      const data = currentFlakeData.core;
      const s = eased;
      coreMesh.position.set(...data.position);
      coreMesh.rotation.set(...data.rotation);
      coreMesh.scale.set(data.scale[0] * s, data.scale[1] * s, data.scale[2] * s);
    }

    flakeHolder.position.y = (1 - eased) * -2;

    if (bloomPass.enabled) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  return sceneInterface;
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
