import * as THREE from 'three';
import { BuildResult } from './geometry';

const EASING_LUT_SIZE = 1024;
const LUT_SIZE_MINUS_ONE = EASING_LUT_SIZE - 1;
const LUT_SCALE_FACTOR = 2 * LUT_SIZE_MINUS_ONE;
const THRESHOLD_SCALE_FACTOR = 1.5 * LUT_SCALE_FACTOR;

const SIN60 = 0.86602540378;

const EASING_LUT = new Float32Array(EASING_LUT_SIZE);
for (let i = 0; i < EASING_LUT_SIZE; i++) {
  const t = i / LUT_SIZE_MINUS_ONE;
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
  resetView: () => void;
  rotateView: (dx: number, dy: number) => void;
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
  const particleVelBase = new Float32Array(particleCount);
  const particleSinPhaseBase = new Float32Array(particleCount);
  const particleCosPhaseBase = new Float32Array(particleCount);

  // Performance Optimization: Pre-scaled buffers for particle velocity and drift components.
  // These eliminate hundreds of multiplications per frame by hoisting the motionScale
  // and driftScale applications to the initialization and mode-change phases.
  const particleVelScaled = new Float32Array(particleCount);
  const particleSinPhaseScaled = new Float32Array(particleCount);
  const particleCosPhaseScaled = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    particlePos[i * 3] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    particlePos[i * 3 + 2] = (Math.random() - 0.5) * 10;
    particleVelBase[i] = 0.02 + Math.random() * 0.03;
    const phase = Math.random() * Math.PI * 2;
    particleSinPhaseBase[i] = Math.sin(phase);
    particleCosPhaseBase[i] = Math.cos(phase);
  }

  let motionScale = prefersReducedMotion ? 0.25 : 1;
  let timeStep = 0.3 * motionScale;
  let driftScale = 0.002 * motionScale;

  function updateScaledParticles() {
    for (let i = 0; i < particleCount; i++) {
      particleVelScaled[i] = particleVelBase[i] * motionScale;
      particleSinPhaseScaled[i] = particleSinPhaseBase[i] * driftScale;
      particleCosPhaseScaled[i] = particleCosPhaseBase[i] * driftScale;
    }
  }
  updateScaledParticles();

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
  const INV_ENTRY_DURATION = 1 / ENTRY_DURATION_MS;
  let entryStartTime = 0;
  let entryActive = false;
  let lastEntryActive: string | null = null;
  let lastEntryProgress: string | null = null;

  function syncEntryState() {
    const active = entryActive.toString();
    const progress = entryState.progress.toFixed(3);
    // Only update DOM if values changed to avoid redundant work and test instability.
    // Use setAttribute for robust synchronization with testing engines (Playwright).
    if (lastEntryActive !== active) {
      canvas.setAttribute('data-entry-active', active);
      lastEntryActive = active;
    }
    if (lastEntryProgress !== progress) {
      canvas.setAttribute('data-entry-progress', progress);
      lastEntryProgress = progress;
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
    const t = (now - entryStartTime) * INV_ENTRY_DURATION;
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
    resetView: () => {
      rotation.x = 0;
      rotation.y = 0;
      targetRotation.x = 0;
      targetRotation.y = 0;
      mouse.x = 0;
      mouse.y = 0;
      mouse.targetX = 0;
      mouse.targetY = 0;
    },
    rotateView: (dx: number, dy: number) => {
      targetRotation.y += dx;
      targetRotation.x += dy;
    },
    updateFlake: (data: BuildResult, animate = true) => {
      currentFlakeData = data;

      // Performance Optimization: Hoist static core updates out of the render loop.
      // Position and rotation are constant for a given snowflake and only need to be set once.
      const coreData = data.core;
      coreMesh.position.set(coreData.position[0], coreData.position[1], coreData.position[2]);
      coreMesh.rotation.set(coreData.rotation[0], coreData.rotation[1], coreData.rotation[2]);

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
        if (typeof branchMesh.instanceMatrix.clearUpdateRanges === 'function') {
          branchMesh.instanceMatrix.clearUpdateRanges();
          branchMesh.instanceMatrix.addUpdateRange(0, data.matrices.length);
        } else {
          (branchMesh.instanceMatrix as any).updateRange = { offset: 0, count: data.matrices.length };
        }
        branchMesh.instanceMatrix.needsUpdate = true;
        minAnimatedIndex = data.armCount;
      } else {
        // Performance Optimization: Zero out the basis for all active instances in a single pass
        // and copy only the translations. This avoids thousands of small fill() calls and
        // redundant copies of basis data that will be immediately zeroed.
        const target = branchMesh.instanceMatrix.array as Float32Array;
        const source = data.matrices;
        target.fill(0, 0, requiredCount << 4);
        for (let i = 0; i < requiredCount; i++) {
          const o = i << 4;
          target[o + 12] = source[o + 12];
          target[o + 13] = source[o + 13];
          target[o + 14] = source[o + 14];
          target[o + 15] = 1;
        }
        branchMesh.instanceMatrix.clearUpdateRanges();
        branchMesh.instanceMatrix.needsUpdate = true;
        minAnimatedIndex = 0;

        // Optimization: Pre-scale delays to shift arithmetic out of the render loop.
        const delays = data.delays;
        for (let i = 0; i < delays.length; i++) {
          delays[i] *= LUT_SCALE_FACTOR;
        }
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
    motionScale = prefersReducedMotion ? 0.25 : 1;
    timeStep = 0.3 * motionScale;
    driftScale = 0.002 * motionScale;
    updateScaledParticles();

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

    time += delta * timeStep;
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

    let idx3 = 0;
    for (let i = 0; i < particleCount; i++) {
      let px = positions[idx3];
      let py = positions[idx3 + 1];

      py -= particleVelScaled[i];
      // Horizontal drift using pre-calculated phase components
      // Performance Optimization: Using pre-scaled phase components (particleCosPhaseScaled and
      // particleSinPhaseScaled) eliminates approximately 400 multiplications per frame.
      const drift = sinTime * particleCosPhaseScaled[i] + cosTime * particleSinPhaseScaled[i];
      px += drift;

      if (py < -10) {
        py = 10;
        px = (Math.random() - 0.5) * 20;
      }

      positions[idx3] = px;
      positions[idx3 + 1] = py;
      idx3 += 3;
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
          if (typeof branchMesh.instanceMatrix.clearUpdateRanges === 'function') {
            branchMesh.instanceMatrix.clearUpdateRanges();
            branchMesh.instanceMatrix.addUpdateRange(0, currentFlakeData.matrices.length);
          } else {
            (branchMesh.instanceMatrix as any).updateRange = { offset: 0, count: currentFlakeData.matrices.length };
          }
          branchMesh.instanceMatrix.needsUpdate = true;
          minAnimatedIndex = currentFlakeData.armCount;
        } else {
          // Animated growth: apply scale to pre-computed matrices manually to avoid O(N) compose()
          const target = branchMesh.instanceMatrix.array as Float32Array;
          const source = currentFlakeData.matrices;
          const armLen = currentFlakeData.armCount;
          const thresholdScaled = eased * THRESHOLD_SCALE_FACTOR;
          const initialMinAnimatedIndex = minAnimatedIndex;
          let maxIndex = -1;

          // Optimization: Outer loop over the single arm's instances.
          // Start from minAnimatedIndex to skip already-grown segments.
          let batchStart = -1;
          let batchCount = 0;

          // Performance Optimization: Use additive index tracking for segIdx to avoid
          // a multiplication (j * 96) in every iteration of the growth animation loop.
          let segIdx = minAnimatedIndex * 96;
          for (let j = minAnimatedIndex; j < armLen; j++) {
            const delay = currentFlakeData.delays[j];

            // Optimization: Early break since segments are sorted by delay.
            if (delay > thresholdScaled) {
              if (batchStart !== -1) {
                target.set(source.subarray(batchStart, batchStart + batchCount), batchStart);
              }
              break;
            }

            // Performance Optimization: Direct bitwise-truncated index into EASING_LUT.
            // Replaces Math.min and redundant multiplications within the hot loop.
            const lutIdx = (thresholdScaled - delay) | 0;

            // If this segment is fully grown, we batch the copy operation for contiguous segments.
            if (lutIdx >= LUT_SIZE_MINUS_ONE) {
              if (batchStart === -1) {
                batchStart = segIdx;
                batchCount = 96;
              } else {
                batchCount += 96;
              }
              if (j === minAnimatedIndex) minAnimatedIndex++;
              maxIndex = j;
              segIdx += 96;
              continue;
            }

            // Before processing a segment that isn't fully grown, flush the current batch.
            if (batchStart !== -1) {
              target.set(source.subarray(batchStart, batchStart + batchCount), batchStart);
              batchStart = -1;
              batchCount = 0;
            }

            maxIndex = j;
            const s = EASING_LUT[lutIdx];

            // Optimization: Hoist invariant calculations for Column 2 and 3 Z-basis components.
            // These are identical for all 6 arms as they represent Z-tilt and thickness.
            const m6s = source[segIdx + 6] * s;
            const m10s = source[segIdx + 10] * s;

            target[segIdx + 6] =
              target[segIdx + 22] =
              target[segIdx + 38] =
              target[segIdx + 54] =
              target[segIdx + 70] =
              target[segIdx + 86] =
                m6s;
            target[segIdx + 10] =
              target[segIdx + 26] =
              target[segIdx + 42] =
              target[segIdx + 58] =
              target[segIdx + 74] =
              target[segIdx + 90] =
                m10s;

            // Arm 0 (Primary Arm, 0°)
            const sm0 = source[segIdx + 0] * s;
            const sm1 = source[segIdx + 1] * s;
            const sm4 = source[segIdx + 4] * s;
            const sm5 = source[segIdx + 5] * s;
            const sm8 = source[segIdx + 8] * s;
            const sm9 = source[segIdx + 9] * s;
            target[segIdx + 0] = sm0;
            target[segIdx + 1] = sm1;
            target[segIdx + 4] = sm4;
            target[segIdx + 5] = sm5;
            target[segIdx + 8] = sm8;
            target[segIdx + 9] = sm9;

            // Arm 1 (60°)
            // Performance Optimization: Derive Arm 1 basis directly from Arm 0 using hexagonal
            // symmetry identities. This eliminates 6 memory reads and 6 multiplications with 's'
            // per segment per frame.
            const sm0_1 = 0.5 * sm0 - SIN60 * sm1;
            const sm1_1 = SIN60 * sm0 + 0.5 * sm1;
            const sm4_1 = 0.5 * sm4 - SIN60 * sm5;
            const sm5_1 = SIN60 * sm4 + 0.5 * sm5;
            const sm8_1 = 0.5 * sm8 - SIN60 * sm9;
            const sm9_1 = SIN60 * sm8 + 0.5 * sm9;
            target[segIdx + 16] = sm0_1;
            target[segIdx + 17] = sm1_1;
            target[segIdx + 20] = sm4_1;
            target[segIdx + 21] = sm5_1;
            target[segIdx + 24] = sm8_1;
            target[segIdx + 25] = sm9_1;

            // Arm 2 (120°) = Arm 1 - Arm 0
            const sm0_2 = sm0_1 - sm0;
            const sm1_2 = sm1_1 - sm1;
            const sm4_2 = sm4_1 - sm4;
            const sm5_2 = sm5_1 - sm5;
            const sm8_2 = sm8_1 - sm8;
            const sm9_2 = sm9_1 - sm9;
            target[segIdx + 32] = sm0_2;
            target[segIdx + 33] = sm1_2;
            target[segIdx + 36] = sm4_2;
            target[segIdx + 37] = sm5_2;
            target[segIdx + 40] = sm8_2;
            target[segIdx + 41] = sm9_2;

            // Arm 3 (180°) = -Arm 0
            target[segIdx + 48] = -sm0;
            target[segIdx + 49] = -sm1;
            target[segIdx + 52] = -sm4;
            target[segIdx + 53] = -sm5;
            target[segIdx + 56] = -sm8;
            target[segIdx + 57] = -sm9;

            // Arm 4 (240°) = -Arm 1
            target[segIdx + 64] = -sm0_1;
            target[segIdx + 65] = -sm1_1;
            target[segIdx + 68] = -sm4_1;
            target[segIdx + 69] = -sm5_1;
            target[segIdx + 72] = -sm8_1;
            target[segIdx + 73] = -sm9_1;

            // Arm 5 (300°) = -Arm 2
            target[segIdx + 80] = -sm0_2;
            target[segIdx + 81] = -sm1_2;
            target[segIdx + 84] = -sm4_2;
            target[segIdx + 85] = -sm5_2;
            target[segIdx + 88] = -sm8_2;
            target[segIdx + 89] = -sm9_2;

            segIdx += 96;
          }

          // Flush final batch if it exists (e.g. if loop completed with fully grown segments)
          if (batchStart !== -1) {
            target.set(source.subarray(batchStart, batchStart + batchCount), batchStart);
          }

          // Optimize GPU upload: only transfer the window of segments that are currently growing.
          if (maxIndex >= initialMinAnimatedIndex) {
            if (typeof branchMesh.instanceMatrix.clearUpdateRanges === 'function') {
              branchMesh.instanceMatrix.clearUpdateRanges();
              const start = initialMinAnimatedIndex * 96; // 6 arms * 16 floats
              const count = (maxIndex - initialMinAnimatedIndex + 1) * 96;
              branchMesh.instanceMatrix.addUpdateRange(start, count);
            } else {
              const start = initialMinAnimatedIndex * 96;
              const count = (maxIndex - initialMinAnimatedIndex + 1) * 96;
              (branchMesh.instanceMatrix as any).updateRange = { offset: start, count: count };
            }
            branchMesh.instanceMatrix.needsUpdate = true;
          }
        }
      }

      if (coreMesh && currentFlakeData) {
        const coreData = currentFlakeData.core;
        const s = eased;
        coreMesh.scale.set(coreData.scale[0] * s, coreData.scale[1] * s, coreData.scale[2] * s);
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
