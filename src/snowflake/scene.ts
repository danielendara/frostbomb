import * as THREE from 'three';
import { BuildResult } from './geometry';

const EASING_LUT_SIZE = 1024;
const EASING_LUT = new Float32Array(EASING_LUT_SIZE);
for (let i = 0; i < EASING_LUT_SIZE; i++) {
  const t = i / (EASING_LUT_SIZE - 1);
  EASING_LUT[i] = t === 0 ? 0 : (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
}

/**
 * Fast O(1) easing using a look-up table.
 * Performance: Avoids ~25,000 Math.pow calls per second during complex snowflake growth.
 */
function easeOutExpoFast(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return EASING_LUT[(t * (EASING_LUT_SIZE - 1)) | 0];
}

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

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    metalness: 0,
    roughness: 0.15,
    transmission: 0.85,
    thickness: 0.5,
    ior: 1.31,
    dispersion: 0.02,
    reflectivity: 0.5,
    transparent: true,
    opacity: 0.9,
    emissive: new THREE.Color('#e0f0ff'),
    emissiveIntensity: 0.25,
  });

  const branchGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);

  // Snowfall particles
  const particleCount = prefersReducedMotion ? 80 : 200;
  const particleGeom = new THREE.BufferGeometry();
  const particlePos = new Float32Array(particleCount * 3);
  const particleVel = new Float32Array(particleCount);
  const particleSinPhase = new Float32Array(particleCount);
  const particleCosPhase = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    particleVel[i] = 0.02 + Math.random() * 0.03;
    const phase = Math.random() * Math.PI * 2;
    particleSinPhase[i] = Math.sin(phase);
    particleCosPhase[i] = Math.cos(phase);
  }

  particleGeom.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
  const particleMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.05,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });
  const particles = new THREE.Points(particleGeom, particleMat);
  scene.add(particles);

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
    } finally {
      postprocessingLoading = false;
    }
  }

  // Interaction
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
      particleGeom.dispose();
      particleMat.dispose();
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
          particleMat.color.set('#ffb2d1');
          particleMat.opacity = 0.6;
          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.set(0x0c0512);
          }
        } else {
          material.color.set('#ffffff');
          material.emissive.set('#e0f0ff');
          particleMat.color.set(0xffffff);
          particleMat.opacity = 0.5;
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
        particleMat.opacity = 0.8;
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

      branchMesh.count = requiredCount;

      if (!animate) {
        // Fast-path for non-animated updates (e.g. Lab Mode): directly copy the pre-computed
        // matrices to the GPU buffer and skip the basis-zeroing loop.
        branchMesh.instanceMatrix.array.set(data.matrices);
        branchMesh.instanceMatrix.clearUpdateRanges();
        branchMesh.instanceMatrix.needsUpdate = true;
        minAnimatedIndex = data.armCount;
      } else {
        // Optimization: Pre-fill the instance matrix with the final state but zero out the basis
        // for all active instances. This avoids needing to zero it every frame during animation.
        const target = branchMesh.instanceMatrix.array as Float32Array;
        target.set(data.matrices);
        for (let i = 0; i < requiredCount; i++) {
          const idx = i * 16;
          // Zero out the 3x3 basis (columns 1-3)
          target[idx + 0] = target[idx + 1] = target[idx + 2] = 0;
          target[idx + 4] = target[idx + 5] = target[idx + 6] = 0;
          target[idx + 8] = target[idx + 9] = target[idx + 10] = 0;
        }
        branchMesh.instanceMatrix.clearUpdateRanges();
        branchMesh.instanceMatrix.needsUpdate = true;
        minAnimatedIndex = 0;
      }

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

    // Update snowflake material colors for Prism Mode
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

    // Animate snowfall particles
    const positions = particles.geometry.attributes.position.array as Float32Array;
    // Optimization: Use trig identity sin(a + b) = sin(a)cos(b) + cos(a)sin(b)
    // to replace 200 sin() calls with 2 sin/cos calls per frame.
    const sinTime = Math.sin(time);
    const cosTime = Math.cos(time);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3 + 1] -= particleVel[i] * motionScale;
      // Horizontal drift using pre-calculated phase components
      const drift = sinTime * particleCosPhase[i] + cosTime * particleSinPhase[i];
      positions[i * 3] += drift * 0.002 * motionScale;

      if (positions[i * 3 + 1] < -10) {
        positions[i * 3 + 1] = 10;
        positions[i * 3] = (Math.random() - 0.5) * 20;
      }
    }
    particles.geometry.attributes.position.needsUpdate = true;

    // Match particle colors to modes (Prism Mode only, others are handled by setters)
    if (sceneInterface.isPrismModeEnabled) {
      const hue = (now * 0.00015 + 0.5) % 1; // Offset hue slightly
      particleMat.color.setHSL(hue, 0.8, 0.8);
    }
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
        if (eased === 1) {
          // Fast-path for finished animation: bulk copy pre-computed matrices
          branchMesh.instanceMatrix.array.set(currentFlakeData.matrices);
          branchMesh.instanceMatrix.clearUpdateRanges();
          minAnimatedIndex = currentFlakeData.armCount;
        } else {
          // Animated growth: apply scale to pre-computed matrices manually to avoid O(N) compose()
          const target = branchMesh.instanceMatrix.array as Float32Array;
          const source = currentFlakeData.matrices;
          const armLen = currentFlakeData.armCount;
          const threshold = eased * 1.5;
          let maxIndex = -1;

          // Optimization: Outer loop over the single arm's instances.
          // Start from minAnimatedIndex to skip already-grown segments.
          for (let j = minAnimatedIndex; j < armLen; j++) {
            const delay = currentFlakeData.delays[j];

            // Optimization: Early break since segments are sorted by delay.
            if (delay > threshold) break;

            const progress = Math.min(1, (threshold - delay) * 2);

            // If this segment is fully grown, advance the minimum animation pointer
            // so we skip it entirely in the next frame.
            if (progress >= 1) {
              if (j === minAnimatedIndex) minAnimatedIndex++;
            }

            maxIndex = j;
            const s = easeOutExpoFast(progress);

            // Inner loop: Apply scale to all 6 symmetry instances.
            // Optimization: Use additive indexing to avoid redundant multiplications.
            let idx = j * 16;
            const stride = armLen * 16;

            for (let i = 0; i < 6; i++) {
              // Column 1
              target[idx + 0] = source[idx + 0] * s;
              target[idx + 1] = source[idx + 1] * s;
              target[idx + 2] = source[idx + 2] * s;
              // Column 2
              target[idx + 4] = source[idx + 4] * s;
              target[idx + 5] = source[idx + 5] * s;
              target[idx + 6] = source[idx + 6] * s;
              // Column 3
              target[idx + 8] = source[idx + 8] * s;
              target[idx + 9] = source[idx + 9] * s;
              target[idx + 10] = source[idx + 10] * s;
              idx += stride;
            }
          }

          // Optimize GPU upload: only transfer the window of segments that are currently growing.
          // Using plural update ranges (supported in Three.js r159+) to minimize PCIe bus traffic.
          if (typeof branchMesh.instanceMatrix.clearUpdateRanges === 'function') {
            branchMesh.instanceMatrix.clearUpdateRanges();
            if (maxIndex >= minAnimatedIndex) {
              const updateCount = (maxIndex - minAnimatedIndex + 1) * 16;
              for (let i = 0; i < 6; i++) {
                const start = (i * armLen + minAnimatedIndex) * 16;
                branchMesh.instanceMatrix.addUpdateRange(start, updateCount);
              }
            }
          } else {
            // Fallback for older Three.js versions: update the entire modified range
            const start = minAnimatedIndex * 16;
            const end = (5 * armLen + maxIndex + 1) * 16;
            (branchMesh.instanceMatrix as any).updateRange = { offset: start, count: end - start };
          }
        }
        branchMesh.instanceMatrix.needsUpdate = true;
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

    if (!postprocessingRequested && !prefersReducedMotion) {
      postprocessingRequested = true;
      window.setTimeout(() => {
        loadPostprocessing();
      }, 0);
    }
  }

  return sceneInterface;
}

