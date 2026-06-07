import * as THREE from 'three';
import { BuildResult } from './geometry';
import { easeOutExpoFast } from './easing';
import { prepareBranchMesh, updateBranchAnimation } from './flake-animation';
import { createIceBumpMap, createEnvironmentMap, createIceMaterial } from './materials';
import { createParticles } from './particles';
import { createOneTimeMark, markPerformance } from '../performance';

interface RenderPipeline {
  render: (delta?: number) => void;
  setSize: (width: number, height: number) => void;
  dispose: () => void;
}

export interface Scene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: RenderPipeline;
  flakeHolder: THREE.Group;
  start: () => void;
  dispose: () => void;
  isAutoRotateEnabled: boolean;
  isPinkModeEnabled: boolean;
  isPrismModeEnabled: boolean;
  setAutoRotate: (enabled: boolean) => void;
  setPinkMode: (enabled: boolean) => void;
  setPrismMode: (enabled: boolean) => void;
  updateFlake: (data: BuildResult, animate?: boolean) => void;
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;
  const maxPixelRatio = Math.min(window.devicePixelRatio, prefersReducedMotion ? 1 : 2);
  let qualityScale = prefersReducedMotion ? 0.7 : 1;

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
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  });
  function applyPixelRatio() {
    renderer.setPixelRatio(Math.max(0.75, maxPixelRatio * qualityScale));
  }

  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

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

  const bumpMap = createIceBumpMap();
  const envMap = createEnvironmentMap();
  scene.environment = envMap;

  const material = createIceMaterial(bumpMap);
  const branchGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

  const snowflakeParticles = createParticles(prefersReducedMotion);
  scene.add(snowflakeParticles.points);

  let branchMesh: THREE.InstancedMesh | null = null;
  const coreMesh = new THREE.Mesh(branchGeom, material);
  let currentFlakeData: BuildResult | null = null;

  let composer: RenderPipeline = {
    render: () => renderer.render(scene, camera),
    setSize: () => {},
    dispose: () => {},
  };
  let postprocessingLoaded = false;
  let postprocessingLoading = false;
  let postprocessingRequested = false;
  const markFirstFrameRendered = createOneTimeMark('first-frame-rendered');

  async function loadPostprocessing() {
    if (postprocessingLoaded || postprocessingLoading || prefersReducedMotion) return;
    postprocessingLoading = true;

    try {
      const {
        EffectComposer,
        EffectPass,
        RenderPass,
        BloomEffect,
        SMAAEffect,
        SMAAPreset,
      } = await import('postprocessing');

      if (prefersReducedMotion) return;

      const nextComposer = new EffectComposer(renderer);
      nextComposer.addPass(new RenderPass(scene, camera));

      const bloomEffect = new BloomEffect({
        intensity: 1.1,
        luminanceThreshold: 0.55,
        luminanceSmoothing: 0.3,
        mipmapBlur: true,
        radius: 0.75,
      });

      const smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });

      nextComposer.addPass(new EffectPass(camera, bloomEffect));
      nextComposer.addPass(new EffectPass(camera, smaaEffect));
      nextComposer.setSize(window.innerWidth, window.innerHeight);

      composer.dispose();
      composer = nextComposer;
      sceneInterface.composer = composer;
      postprocessingLoaded = true;
      markPerformance('postprocessing-ready');
    } finally {
      postprocessingLoading = false;
    }
  }

  let isAutoRotate = !prefersReducedMotion;
  let isDragging = false;
  const rotation = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  canvas.style.cursor = 'grab';

  function handlePointerMove(e: PointerEvent) {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 0.3;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
    if (isDragging) {
      targetRotation.y += (e.movementX || 0) * 0.01;
      targetRotation.x += (e.movementY || 0) * 0.01;
    }
  }

  function handlePointerDown() {
    isDragging = true;
    canvas.style.cursor = 'grabbing';
  }

  function handlePointerUp() {
    isDragging = false;
    canvas.style.cursor = 'grab';
  }

  window.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointerup', handlePointerUp);

  function updateCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    camera.aspect = aspect;

    // Adjust distance based on aspect ratio to ensure snowflake fits horizontally
    // 10 is the base distance for landscape/square. For portrait, we push the camera
    // back proportionally to the aspect ratio to maintain visible width.
    if (aspect < 1) {
      camera.position.z = 10 / aspect;
    } else {
      camera.position.z = 10;
    }

    camera.updateProjectionMatrix();
    applyPixelRatio();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }

  window.addEventListener('resize', updateCamera);
  updateCamera();

  let frameId = 0;
  let time = 0;
  let isRunning = false;
  let averageDelta = 1 / 60;
  let slowFrameCount = 0;
  let needsMatrixUpdate = false;
  let minAnimatedIndex = 0;
  const entryState = { progress: 0 };
  const ENTRY_DURATION_MS = 2200;
  let entryStartTime = 0;
  let entryActive = false;

  function syncEntryState() {
    const active = entryActive.toString();
    const progress = entryState.progress.toFixed(3);
    // Only update DOM if values changed to avoid redundant work and test instability
    if (canvas.dataset.entryActive !== active) {
      canvas.dataset.entryActive = active;
    }
    if (canvas.dataset.entryProgress !== progress) {
      canvas.dataset.entryProgress = progress;
    }
  }
  syncEntryState();

  function startEntryTween() {
    entryState.progress = 0;
    entryStartTime = performance.now();
    entryActive = true;
    syncEntryState();
  }

  function cancelEntryTween() {
    entryActive = false;
    syncEntryState();
  }

  function tickEntryTween(now: number) {
    if (!entryActive) {
      return;
    }
    const t = (now - entryStartTime) / ENTRY_DURATION_MS;
    if (t >= 1) {
      entryState.progress = 1;
      entryActive = false;
    } else {
      entryState.progress = easeOutExpoFast(t);
    }
    syncEntryState();
  }

  const tempColor = new THREE.Color();

  const sceneInterface: Scene = {
    scene,
    camera,
    renderer,
    composer,
    flakeHolder,
    isAutoRotateEnabled: !prefersReducedMotion,
    isPinkModeEnabled: false,
    isPrismModeEnabled: false,
    start: () => {
      if (!isRunning && !document.hidden) {
        isRunning = true;
        frameId = requestAnimationFrame(animate);
      }
    },
    dispose: () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
      cancelEntryTween();
      timer.dispose();
      window.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', updateCamera);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      reducedMotionQuery.removeEventListener('change', handleReducedMotionChange);
      renderer.dispose();
      composer.dispose();
      branchMesh?.dispose();
      branchGeom.dispose();
      material.dispose();
      bumpMap.dispose();
      envMap.dispose();
      snowflakeParticles.dispose();
    },
    setAutoRotate: (enabled: boolean) => {
      isAutoRotate = enabled && !prefersReducedMotion;
      sceneInterface.isAutoRotateEnabled = isAutoRotate;
      if (!enabled) {
        rotation.x = targetRotation.x;
        rotation.y = targetRotation.y;
      }
    },
    setPinkMode: (enabled: boolean) => {
      sceneInterface.isPinkModeEnabled = enabled;
      if (!sceneInterface.isPrismModeEnabled) {
        if (enabled) {
          material.color.set('#ffb2d1');
          material.emissive.set('#ff80bf');
          snowflakeParticles.setColorForMode('pink');
          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.set(0x0c0512);
          }
        } else {
          material.color.set('#ffffff');
          material.emissive.set('#e0f0ff');
          snowflakeParticles.setColorForMode('default');
          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.set(0x050912);
          }
        }
      }
    },
    setPrismMode: (enabled: boolean) => {
      sceneInterface.isPrismModeEnabled = enabled;
      if (!enabled) {
        // Restore Pink or Default mode colors
        sceneInterface.setPinkMode(sceneInterface.isPinkModeEnabled);
      } else {
        // Boost opacity when entering Prism mode
        snowflakeParticles.setColorForMode('prism');
      }
    },
    updateFlake: (data: BuildResult, animate = true) => {
      currentFlakeData = data;
      const requiredCount = data.matrices.length / 16;

      // Only recreate the InstancedMesh if the existing one is too small.
      // We add a bit of headroom to avoid frequent re-allocations during interactive growth.
      const currentCapacity = branchMesh ? branchMesh.instanceMatrix.array.length / 16 : 0;

      if (!branchMesh || requiredCount > currentCapacity) {
        if (branchMesh) {
          flakeHolder.remove(branchMesh);
          branchMesh.dispose();
        }

        const capacity = Math.ceil(requiredCount * 1.25);
        branchMesh = new THREE.InstancedMesh(
          branchGeom,
          material,
          capacity,
        );
        flakeHolder.add(branchMesh);
      }

      minAnimatedIndex = prepareBranchMesh(branchMesh, data, animate);

      if (!flakeHolder.children.includes(coreMesh)) {
        flakeHolder.add(coreMesh);
      }

      needsMatrixUpdate = true;

      if (animate && !prefersReducedMotion) {
        startEntryTween();
      } else {
        entryState.progress = 1;
        entryActive = false;
        syncEntryState();
      }
    },
  };

  const timer = new THREE.Timer();
  timer.connect(document);

  function handleVisibilityChange() {
    if (document.hidden) {
      isRunning = false;
      cancelAnimationFrame(frameId);
      return;
    }

    timer.reset();
    if (!isRunning) {
      isRunning = true;
      frameId = requestAnimationFrame(animate);
    }
  }

  function handleReducedMotionChange(e: MediaQueryListEvent) {
    prefersReducedMotion = e.matches;
    if (prefersReducedMotion) {
      qualityScale = Math.min(qualityScale, 0.7);
      sceneInterface.setAutoRotate(false);
      cancelEntryTween();
      entryState.progress = 1;
      syncEntryState();
    } else {
      loadPostprocessing();
    }
    updateCamera();
  }

  document.addEventListener('visibilitychange', handleVisibilityChange);
  reducedMotionQuery.addEventListener('change', handleReducedMotionChange);

  function adaptQuality(delta: number) {
    if (prefersReducedMotion || qualityScale <= 0.75) return;

    averageDelta = averageDelta * 0.95 + delta * 0.05;
    slowFrameCount = averageDelta > 1 / 32 ? slowFrameCount + 1 : 0;

    if (slowFrameCount > 90) {
      qualityScale = 0.75;
      slowFrameCount = 0;
      updateCamera();
    }
  }

  function animate(timestamp?: number) {
    if (!isRunning) return;
    frameId = requestAnimationFrame(animate);
    const now = timestamp ?? performance.now();
    timer.update(now);
    const delta = timer.getDelta();
    const motionScale = prefersReducedMotion ? 0.25 : 1;
    time += delta * 0.3 * motionScale;
    adaptQuality(delta);

    if (sceneInterface.isPrismModeEnabled) {
      const hue = (now * 0.0001) % 1;
      material.color.setHSL(hue, 0.6, 0.8);
      material.emissive.setHSL(hue, 0.8, 0.6);
      if (scene.fog instanceof THREE.FogExp2) {
        // Fog color follows a darkened version of the hue
        tempColor.setHSL(hue, 0.4, 0.05);
        scene.fog.color.copy(tempColor);
      }
    }

    snowflakeParticles.update(time, motionScale, sceneInterface.isPrismModeEnabled, now);

    const wasEntryActive = entryActive;
    tickEntryTween(now);

    const eased = entryState.progress;

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

    if (wasEntryActive || entryActive || needsMatrixUpdate) {
      if (branchMesh && currentFlakeData) {
        minAnimatedIndex = updateBranchAnimation(
          branchMesh,
          currentFlakeData,
          eased,
          minAnimatedIndex,
        );
      }

      if (coreMesh && currentFlakeData) {
        const data = currentFlakeData.core;
        const s = eased;
        coreMesh.position.set(data.position[0], data.position[1], data.position[2]);
        coreMesh.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        coreMesh.scale.set(data.scale[0] * s, data.scale[1] * s, data.scale[2] * s);
      }

      flakeHolder.position.y = (1 - eased) * -2;
      needsMatrixUpdate = false;
    }

    composer.render(delta);
    markFirstFrameRendered();

    if (!postprocessingRequested && !prefersReducedMotion) {
      postprocessingRequested = true;
      window.setTimeout(() => {
        loadPostprocessing();
      }, 0);
    }
  }

  return sceneInterface;
}
