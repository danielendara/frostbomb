import * as THREE from "three";
import { BuildResult } from "./geometry";
import {
  PostprocessingPipeline,
  RenderPipeline,
  skipPostprocessingFromEnvironment,
} from "./postprocessing";
import { MARK_FIRST_FRAME_RENDERED, markOnce } from "./perf-marks";
import { SnowfallParticleSystem } from "./particles";
import { GrowthAnimator, LUT_SCALE_FACTOR } from "./growth-animator";
import { createFrostPlaceholders, loadFrostMaps } from "./frost";
import { preventSilentContextLoss } from "./context-loss";
import { advanceAutoRotate, INITIAL_AUTO_ROTATE } from "./auto-rotate";

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
  setPhotoMode: (enabled: boolean) => void;
  updateFlake: (data: BuildResult, animate?: boolean) => void;
  resetView: () => void;
  rotateView: (dx: number, dy: number) => void;
  /** Re-fit camera, pixel ratio, renderer and composer to the window (the `resize` handler). */
  resize: () => void;
}

export interface SceneOptions {
  onContextLost?: () => void;
}

export function createScene(canvas: HTMLCanvasElement, options: SceneOptions = {}): Scene {
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let prefersReducedMotion = reducedMotionQuery.matches;
  let qualityScale = prefersReducedMotion ? 0.7 : 1;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050912, 0.06);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 10);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
  });

  function applyPixelRatio() {
    const cap = Math.min(window.devicePixelRatio || 1, prefersReducedMotion ? 1 : 2);
    renderer.setPixelRatio(Math.max(0.75, cap * qualityScale));
  }

  applyPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x000000, 0);

  // Lighting
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

  let frost = createFrostPlaceholders();

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#ffffff"),
    metalness: 0,
    // Multiplied by the frost roughness map (green). Peaks frost over, facets stay glossier.
    roughness: 0.28,
    roughnessMap: frost.roughnessMap,
    transmission: 0.85,
    thickness: 0.5,
    ior: 1.31,
    dispersion: 0.02,
    reflectivity: 0.5,
    // Thin-film interference on grazing facets. Stays enabled when Pink/Prism
    // retint albedo and emissive — it is view-angle, not a base-color overlay.
    iridescence: 0.8,
    iridescenceIOR: 1.31,
    iridescenceThicknessRange: [150, 380],
    iridescenceThicknessMap: frost.roughnessMap,
    normalMap: frost.normalMap,
    normalScale: new THREE.Vector2(0.18, 0.18),
    sheen: 0.18,
    sheenColor: new THREE.Color("#e4f1ff"),
    sheenRoughness: 0.6,
    transparent: true,
    opacity: 0.9,
    emissive: new THREE.Color("#e0f0ff"),
    emissiveIntensity: 0.25,
  });

  void loadFrostMaps()
    .then((maps) => {
      material.roughnessMap = maps.roughnessMap;
      material.iridescenceThicknessMap = maps.roughnessMap;
      material.normalMap = maps.normalMap;
      material.needsUpdate = true;
      frost.roughnessMap.dispose();
      frost.normalMap.dispose();
      frost = maps;
    })
    .catch((err) => {
      // Keep the 1x1 placeholder textures (still assigned on `material`);
      // the flake just renders without frost detail until next load.
      console.error("Failed to load frost maps:", err);
    });

  const branchGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
  branchGeom.computeTangents();
  const coreMesh = new THREE.Mesh(branchGeom, material);
  let branchMesh: THREE.InstancedMesh | null = null;
  let currentFlakeData: BuildResult | null = null;

  // Domain subsystems
  const particles = new SnowfallParticleSystem(prefersReducedMotion);
  scene.add(particles.particles);

  const pipeline = new PostprocessingPipeline(renderer, scene, camera);
  const animator = new GrowthAnimator(canvas);

  // Interaction State
  let isAutoRotate = !prefersReducedMotion;
  let isDragging = false;
  const rotation = { x: 0, y: 0 };
  const targetRotation = { x: 0, y: 0 };
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  canvas.style.cursor = "grab";

  let dragPointerId = -1;
  let lastDragX = 0;
  let lastDragY = 0;

  function handlePointerMove(e: PointerEvent) {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 0.3;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 0.3;
    if (isDragging && e.pointerId === dragPointerId) {
      targetRotation.y += (e.clientX - lastDragX) * 0.01;
      targetRotation.x += (e.clientY - lastDragY) * 0.01;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    }
  }

  function handlePointerDown(e: PointerEvent) {
    // Only the primary button rotates. Right/middle clicks open a context menu or autoscroll,
    // which can swallow the matching pointerup and leave the drag stuck.
    if (e.button !== 0 || (e.pointerType === "mouse" && e.ctrlKey)) return;
    if (isDragging && e.pointerId !== dragPointerId) return;
    isDragging = true;
    dragPointerId = e.pointerId;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    canvas.style.cursor = "grabbing";
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerId !== dragPointerId) return;
    isDragging = false;
    dragPointerId = -1;
    canvas.style.cursor = "grab";
  }

  // A context menu can swallow the pointerup, so end any drag when it opens.
  function handleContextMenu() {
    if (!isDragging) return;
    isDragging = false;
    dragPointerId = -1;
    canvas.style.cursor = "grab";
  }

  window.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("contextmenu", handleContextMenu);

  if (import.meta.env.DEV) {
    (window as any).__FROSTBOMB_DRAG__ = () => ({
      isDragging,
      x: targetRotation.x,
      y: targetRotation.y,
    });
  }

  function updateCamera() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const aspect = w / h;
    camera.aspect = aspect;

    if (aspect < 1) {
      camera.position.z = 10 / aspect;
    } else {
      camera.position.z = 10;
    }

    camera.updateProjectionMatrix();
    applyPixelRatio();
    renderer.setSize(w, h);
    pipeline.setSize(w, h);
  }

  window.addEventListener("resize", updateCamera);

  // Zoom or a monitor change can alter devicePixelRatio without a resize event.
  let dprQuery: MediaQueryList | null = null;

  function handleDprChange() {
    updateCamera();
    watchDevicePixelRatio();
  }

  function watchDevicePixelRatio() {
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener("change", handleDprChange, { once: true });
  }

  watchDevicePixelRatio();
  updateCamera();

  let frameId = 0;
  let time = 0;
  let autoRotateState = INITIAL_AUTO_ROTATE;
  let isRunning = false;
  let contextLost = false;
  let averageDelta = 1 / 60;
  let slowFrameCount = 0;
  let firstFrameMarked = false;
  let sceneNonblank = false;

  const tempColor = new THREE.Color();

  const sceneInterface: Scene = {
    scene,
    camera,
    renderer,
    composer: pipeline,
    flakeHolder,
    isAutoRotateEnabled: !prefersReducedMotion,
    isPinkModeEnabled: false,
    isPrismModeEnabled: false,
    start: () => {
      if (!isRunning && !document.hidden && !contextLost) {
        isRunning = true;
        frameId = requestAnimationFrame(animate);
      }
    },
    dispose: () => {
      isRunning = false;
      cancelAnimationFrame(frameId);
      animator.cancelEntryTween();
      timer.dispose();
      window.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("resize", updateCamera);
      dprQuery?.removeEventListener("change", handleDprChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      renderer.dispose();
      pipeline.dispose();
      branchMesh?.dispose();
      branchGeom.dispose();
      material.dispose();
      frost.roughnessMap.dispose();
      frost.normalMap.dispose();
      particles.dispose();
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
          material.color.set("#ffb2d1");
          material.emissive.set("#ff80bf");
          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.set(0x0c0512);
          }
        } else {
          material.color.set("#ffffff");
          material.emissive.set("#e0f0ff");
          if (scene.fog instanceof THREE.FogExp2) {
            scene.fog.color.set(0x050912);
          }
        }
      }
      particles.setPinkMode(enabled, sceneInterface.isPrismModeEnabled);
    },
    setPrismMode: (enabled: boolean) => {
      sceneInterface.isPrismModeEnabled = enabled;
      if (!enabled) {
        sceneInterface.setPinkMode(sceneInterface.isPinkModeEnabled);
      }
      particles.setPrismMode(enabled, sceneInterface.isPinkModeEnabled);
    },
    setPhotoMode: (enabled: boolean) => {
      pipeline.setPhotoMode(enabled);
    },
    resize: updateCamera,
    resetView: () => {
      autoRotateState = INITIAL_AUTO_ROTATE;
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

      const coreData = data.core;
      coreMesh.position.set(coreData.position[0], coreData.position[1], coreData.position[2]);
      coreMesh.rotation.set(coreData.rotation[0], coreData.rotation[1], coreData.rotation[2]);

      const requiredCount = data.matrices.length / 16;
      const currentCapacity = branchMesh ? branchMesh.instanceMatrix.array.length / 16 : 0;

      if (!branchMesh || requiredCount > currentCapacity) {
        if (branchMesh) {
          flakeHolder.remove(branchMesh);
          branchMesh.dispose();
        }

        const capacity = Math.ceil(requiredCount * 1.25);
        branchMesh = new THREE.InstancedMesh(branchGeom, material, capacity);
        flakeHolder.add(branchMesh);
      }

      branchMesh.count = requiredCount;
      const shouldAnimate = animate && !prefersReducedMotion;

      if (!shouldAnimate) {
        branchMesh.instanceMatrix.array.set(data.matrices);
        if (typeof branchMesh.instanceMatrix.clearUpdateRanges === "function") {
          branchMesh.instanceMatrix.clearUpdateRanges();
          branchMesh.instanceMatrix.addUpdateRange(0, data.matrices.length);
        } else {
          (branchMesh.instanceMatrix as any).updateRange = {
            offset: 0,
            count: data.matrices.length,
          };
        }
        branchMesh.instanceMatrix.needsUpdate = true;
        animator.minAnimatedIndex = data.armCount;
      } else {
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
        animator.minAnimatedIndex = 0;

        const delays = data.delays;
        for (let i = 0; i < delays.length; i++) {
          delays[i] *= LUT_SCALE_FACTOR;
        }
      }

      if (!flakeHolder.children.includes(coreMesh)) {
        flakeHolder.add(coreMesh);
      }

      if (!shouldAnimate) {
        coreMesh.scale.set(coreData.scale[0], coreData.scale[1], coreData.scale[2]);
        flakeHolder.position.y = 0;
        animator.needsMatrixUpdate = false;
        animator.entryState.progress = 1;
        animator.entryActive = false;
        animator.syncEntryState();
      } else {
        animator.needsMatrixUpdate = true;
        animator.startEntryTween();
      }
    },
  };

  function noteNonblankFrame(glRenderer: THREE.WebGLRenderer, target: HTMLCanvasElement): void {
    try {
      const gl = glRenderer.getContext();
      const w = target.width;
      const h = target.height;
      if (!gl || w < 2 || h < 2) return;
      const px = new Uint8Array(4);
      const samples: Array<[number, number]> = [
        [0.5, 0.5],
        [0.42, 0.5],
        [0.58, 0.5],
        [0.5, 0.42],
        [0.5, 0.58],
      ];
      for (const [u, v] of samples) {
        gl.readPixels((w * u) | 0, (h * v) | 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (px[0] > 4 || px[1] > 4 || px[2] > 4 || px[3] > 4) {
          target.setAttribute("data-scene-nonblank", "true");
          return;
        }
      }
    } catch {
      // readPixels can throw if the context is lost; the smoke test will time out.
    }
  }

  const timer = new THREE.Timer();
  timer.connect(document);

  function handleContextLost(event: Event) {
    preventSilentContextLoss(event);
    contextLost = true;
    isRunning = false;
    cancelAnimationFrame(frameId);
    options.onContextLost?.();
  }

  canvas.addEventListener("webglcontextlost", handleContextLost);

  function handleVisibilityChange() {
    if (document.hidden) {
      isRunning = false;
      cancelAnimationFrame(frameId);
      return;
    }

    if (contextLost) return;

    timer.reset();
    if (!isRunning) {
      isRunning = true;
      frameId = requestAnimationFrame(animate);
    }
  }

  function handleReducedMotionChange(e: MediaQueryListEvent) {
    prefersReducedMotion = e.matches;
    particles.setReducedMotion(prefersReducedMotion);

    if (prefersReducedMotion) {
      qualityScale = Math.min(qualityScale, 0.7);
      sceneInterface.setAutoRotate(false);
      animator.cancelEntryTween();
      animator.entryState.progress = 1;
      if (branchMesh && currentFlakeData) {
        animator.updateMatrices(branchMesh, coreMesh, flakeHolder, currentFlakeData);
      }
      animator.syncEntryState();
    } else if (!skipPostprocessingFromEnvironment(prefersReducedMotion)) {
      pipeline.load(false);
    }
    updateCamera();
  }

  document.addEventListener("visibilitychange", handleVisibilityChange);
  reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

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

  if (import.meta.env.DEV) {
    (window as unknown as { __FROSTBOMB_AUTOROTATE__?: () => unknown }).__FROSTBOMB_AUTOROTATE__ =
      () => ({
        x: flakeHolder.rotation.x,
        y: flakeHolder.rotation.y,
        z: flakeHolder.rotation.z,
      });
  }

  function animate(timestamp?: number) {
    if (!isRunning) return;
    frameId = requestAnimationFrame(animate);
    const now = timestamp ?? performance.now();
    timer.update(now);
    const delta = timer.getDelta();

    time += delta * particles.timeStep;
    adaptQuality(delta);

    if (sceneInterface.isPrismModeEnabled) {
      const hue = (now * 0.0001) % 1;
      material.color.setHSL(hue, 0.6, 0.8);
      material.emissive.setHSL(hue, 0.8, 0.6);
      if (scene.fog instanceof THREE.FogExp2) {
        tempColor.setHSL(hue, 0.4, 0.05);
        scene.fog.color.copy(tempColor);
      }
    }

    particles.update(time, sceneInterface.isPrismModeEnabled, now);

    const wasEntryActive = animator.entryActive;
    animator.tickEntryTween(now);

    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;
    rotation.x += (targetRotation.x - rotation.x) * 0.1;
    rotation.y += (targetRotation.y - rotation.y) * 0.1;

    autoRotateState = advanceAutoRotate(autoRotateState, delta * particles.timeStep, isAutoRotate);

    flakeHolder.rotation.z = autoRotateState.z;
    flakeHolder.rotation.y = rotation.y + mouse.x * 0.4 + autoRotateState.y;
    flakeHolder.rotation.x = rotation.x - mouse.y * 0.3 + autoRotateState.x;

    if (wasEntryActive || animator.entryActive || animator.needsMatrixUpdate) {
      if (branchMesh && currentFlakeData) {
        animator.updateMatrices(branchMesh, coreMesh, flakeHolder, currentFlakeData);
      }
    }

    pipeline.render(delta);

    if (!firstFrameMarked) {
      firstFrameMarked = true;
      markOnce(MARK_FIRST_FRAME_RENDERED);
    }

    if (!sceneNonblank) {
      noteNonblankFrame(renderer, canvas);
      if (canvas.getAttribute("data-scene-nonblank") === "true") {
        sceneNonblank = true;
      }
    }

    pipeline.requestLoad(skipPostprocessingFromEnvironment(prefersReducedMotion));
  }

  return sceneInterface;
}
