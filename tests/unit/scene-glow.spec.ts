/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { GLOW_LOOK, GLOW_MODE, applyGlowLook } from "../../src/ui/mode-toggle";
import { PHOTO_ICE_BY_TIER } from "../../src/snowflake/ice-material";

/** Glow is today's emissive + opacity look; photographic ice defaults to Glow off. */
describe("Glow mode", () => {
  const motionQuery = {
    matches: false,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  async function loadScene(search: string) {
    vi.resetModules();
    window.history.replaceState(null, "", `/${search}`);
    const materials: THREE.MeshPhysicalMaterial[] = [];
    vi.doMock("three", async (importOriginal) => {
      const actual = await importOriginal<typeof import("three")>();
      class FakeWebGLRenderer {
        domElement: HTMLCanvasElement;
        constructor(params: { canvas: HTMLCanvasElement }) {
          this.domElement = params.canvas;
        }
        setPixelRatio() {}
        setSize() {}
        setClearColor() {}
        render() {}
        dispose() {}
      }
      class SpiedMaterial extends actual.MeshPhysicalMaterial {
        constructor(params?: THREE.MeshPhysicalMaterialParameters) {
          super(params);
          materials.push(this);
        }
      }
      return { ...actual, WebGLRenderer: FakeWebGLRenderer, MeshPhysicalMaterial: SpiedMaterial };
    });
    vi.doMock("../../src/snowflake/frost.ts", () => ({
      createFrostPlaceholders: () => ({
        roughnessMap: { dispose: () => {} },
        normalMap: { dispose: () => {} },
      }),
      loadFrostMaps: () => new Promise(() => {}),
    }));
    vi.doMock("../../src/snowflake/scene-environment.ts", () => ({
      ENV_PMREM_SIZE: { rich: 512, lite: 256 },
      buildSceneEnvironment: vi.fn(async () => ({
        texture: {},
        dispose: () => {},
      })),
    }));
    vi.doMock("../../src/snowflake/postprocessing.ts", () => ({
      PostprocessingPipeline: class {
        setSize() {}
        render() {}
        dispose() {}
        setPhotoMode() {}
        setTier() {}
        requestLoad() {}
      },
      shouldSkipPostprocessing: () => false,
      skipPostprocessingFromEnvironment: () => false,
    }));
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const { createScene } = await import("../../src/snowflake/scene.ts");
    const scene = createScene(document.createElement("canvas"));
    return { scene, material: materials[0]! };
  }

  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => motionQuery as unknown as MediaQueryList);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("defaults Glow off on a plain first visit (no glow param)", async () => {
    const { scene, material } = await loadScene("");
    expect(GLOW_MODE.defaultEnabled).toBe(false);
    expect(scene.isGlowEnabled).toBe(false);
    expect(material.emissiveIntensity).toBe(0);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    scene.dispose();
  });

  it("loads photographic ice material params on both tiers when Glow is off", async () => {
    for (const tier of ["rich", "lite"] as const) {
      const { scene, material } = await loadScene(`?quality=${tier}`);
      expect(scene.qualityTier).toBe(tier);
      expect(scene.isGlowEnabled).toBe(false);
      expect(material.roughness).toBe(PHOTO_ICE_BY_TIER[tier].roughness);
      expect(material.transmission).toBe(PHOTO_ICE_BY_TIER[tier].transmission);
      expect(material.dispersion).toBe(PHOTO_ICE_BY_TIER[tier].dispersion);
      expect(material.iridescence).toBe(PHOTO_ICE_BY_TIER[tier].iridescence);
      expect(material.clearcoat).toBe(PHOTO_ICE_BY_TIER[tier].clearcoat);
      scene.dispose();
    }
  });

  it("toggles emissive and opacity off and back on exactly, on both tiers", async () => {
    for (const tier of ["rich", "lite"]) {
      const { scene, material } = await loadScene(`?quality=${tier}`);
      scene.setGlowMode(false);
      expect(scene.isGlowEnabled).toBe(false);
      expect(material.emissiveIntensity).toBe(0);
      expect(material.opacity).toBe(1);
      expect(material.transparent).toBe(false);
      scene.setGlowMode(true);
      expect(scene.isGlowEnabled).toBe(true);
      expect(material.emissiveIntensity).toBe(0.25);
      expect(material.opacity).toBe(0.9);
      expect(material.transparent).toBe(true);
      scene.dispose();
    }
  });

  it("keeps Pink and Prism working with Glow on and off", async () => {
    const { scene, material } = await loadScene("?quality=rich");
    for (const glow of [true, false]) {
      scene.setGlowMode(glow);
      scene.setPinkMode(true);
      expect(material.color.getHexString()).toBe("ffb2d1");
      expect(material.emissive.getHexString()).toBe("ff80bf");
      expect(material.emissiveIntensity).toBe(glow ? 0.25 : 0);
      scene.setPinkMode(false);
      expect(material.color.getHexString()).toBe("ffffff");
      scene.setPrismMode(true);
      expect(scene.isPrismModeEnabled).toBe(true);
      scene.setPrismMode(false);
    }
    scene.dispose();
  });

  it("applyGlowLook matches the GLOW_LOOK table", () => {
    const m = { emissiveIntensity: 0, opacity: 1, transparent: false, needsUpdate: false };
    applyGlowLook(m, true);
    expect(m).toMatchObject({ ...GLOW_LOOK.on, needsUpdate: true });
  });
});
