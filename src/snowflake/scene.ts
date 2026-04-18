import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export interface Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  flakeHolder: THREE.Group;
  start: () => void;
  dispose: () => void;
  setBloom: (enabled: boolean) => void;
  setAutoRotate: (enabled: boolean) => void;
}

interface SnowflakeSegment extends THREE.Object3D {
  userData: {
    dist: number;
    depth: number;
  };
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

  // Lights — cool rim, warm key for refraction glints
  const ambient = new THREE.AmbientLight(0x1a2a4a, 0.5);
  scene.add(ambient);

  // Strong key light for sharp highlights
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
  keyLight.position.set(5, 8, 10);
  scene.add(keyLight);

  // Cool rim light to catch edges
  const rimLight = new THREE.DirectionalLight(0xb0d5ff, 2.5);
  rimLight.position.set(-8, -5, 2);
  scene.add(rimLight);

  // Tiny glint lights (PointLights) to simulate sparkles
  const glint1 = new THREE.PointLight(0xffffff, 1.5, 15);
  glint1.position.set(-2, 3, 4);
  scene.add(glint1);

  const glint2 = new THREE.PointLight(0x9ec9ff, 1.2, 15);
  glint2.position.set(4, -2, 3);
  scene.add(glint2);

  const flakeHolder = new THREE.Group();
  scene.add(flakeHolder);

  // Post-processing
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.8, // strength
    0.5, // radius
    0.9, // threshold
  );
  composer.addPass(bloomPass);

  // Interaction state
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
      const deltaX = e.movementX || 0;
      const deltaY = e.movementY || 0;
      targetRotation.y += deltaX * 0.01;
      targetRotation.x += deltaY * 0.01;
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

  // Resize
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

  function animate() {
    frameId = requestAnimationFrame(animate);
    time += 0.005;

    // Entry animation — flake rises and settles over ~1.5s
    if (entryProgress < 1) {
      entryProgress = Math.min(1, entryProgress + 0.008);
    }
    const eased = easeOutExpo(entryProgress);

    // Ease mouse
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    // Ease rotation
    rotation.x += (targetRotation.x - rotation.x) * 0.1;
    rotation.y += (targetRotation.y - rotation.y) * 0.1;

    // Slow continuous drift + parallax + entry + manual rotation
    const autoZ = isAutoRotate ? time * 0.08 + Math.sin(time * 0.3) * 0.04 : 0;
    const autoY = isAutoRotate ? Math.sin(time * 0.2) * 0.05 : 0;
    const autoX = isAutoRotate ? Math.cos(time * 0.25) * 0.03 : 0;

    flakeHolder.rotation.z = autoZ;
    flakeHolder.rotation.y = rotation.y + mouse.x * 0.4 + autoY;
    flakeHolder.rotation.x = rotation.x - mouse.y * 0.3 + autoX;

    // Staggered growth animation
    flakeHolder.traverse((child) => {
      if ((child as any).isMesh) {
        const segment = child as unknown as SnowflakeSegment;
        const dist = segment.userData.dist ?? 0;
        const depth = segment.userData.depth ?? 0;

        // Each segment starts growing based on its distance from the center and its branch depth
        const delay = dist * 0.15 + depth * 0.1;
        const progress = Math.max(0, Math.min(1, (entryProgress * 1.5 - delay) * 2));
        const s = easeOutExpo(progress);
        segment.scale.setScalar(s);
      }
    });

    flakeHolder.position.y = (1 - eased) * -2;

    if (bloomPass.enabled) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  return {
    scene,
    camera,
    renderer,
    composer,
    flakeHolder,
    start: () => {
      entryProgress = 0;
      animate();
    },
    dispose: () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      composer.dispose();
    },
    setBloom: (enabled: boolean) => {
      bloomPass.enabled = enabled;
    },
    setAutoRotate: (enabled: boolean) => {
      isAutoRotate = enabled;
      if (!enabled) {
        // Snap current rotation to target so it doesn't jump when re-enabled
        rotation.x = targetRotation.x;
        rotation.y = targetRotation.y;
      }
    },
  };
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
