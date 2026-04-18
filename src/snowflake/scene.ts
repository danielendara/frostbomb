import * as THREE from 'three';

export interface Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  flakeHolder: THREE.Group;
  start: () => void;
  dispose: () => void;
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
  renderer.setClearColor(0x000000, 0);

  // Lights — cool rim, warm key for refraction glints
  const ambient = new THREE.AmbientLight(0x4a6a9a, 0.4);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(5, 6, 8);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x9ec9ff, 1.5);
  rimLight.position.set(-6, -3, 4);
  scene.add(rimLight);

  const fillLight = new THREE.PointLight(0xffc78a, 0.6, 20);
  fillLight.position.set(3, -4, 5);
  scene.add(fillLight);

  const flakeHolder = new THREE.Group();
  scene.add(flakeHolder);

  // Subtle parallax on mouse move
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 0.3;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
  });

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
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

    // Slow continuous drift + parallax + entry
    flakeHolder.rotation.z = time * 0.08 + Math.sin(time * 0.3) * 0.04;
    flakeHolder.rotation.y = mouse.x * 0.4 + Math.sin(time * 0.2) * 0.05;
    flakeHolder.rotation.x = -mouse.y * 0.3 + Math.cos(time * 0.25) * 0.03;

    // Staggered growth animation
    flakeHolder.traverse((child: any) => {
      if (!child.isMesh) return;
      // Each segment starts growing based on its distance from the center and its branch depth
      const delay = child.userData.dist * 0.15 + child.userData.depth * 0.1;
      const progress = Math.max(0, Math.min(1, (entryProgress * 1.5 - delay) * 2));
      const s = easeOutExpo(progress);
      child.scale.setScalar(s);
    });

    flakeHolder.position.y = (1 - eased) * -2;

    renderer.render(scene, camera);
  }

  return {
    scene,
    camera,
    renderer,
    flakeHolder,
    start: () => {
      entryProgress = 0;
      animate();
    },
    dispose: () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
    },
  };
}

function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
