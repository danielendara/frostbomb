import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  GLINT_PHASE_GAIN,
  GLINT_SHADER_CONSTANTS,
  GlintController,
  patchGlintShader,
} from "../../src/snowflake/glint.ts";

const REST = new THREE.Vector3(0.35, 0.55, 0.76).normalize();

function lightMoved(glint: GlintController): boolean {
  return glint.uniforms.uGlintLight.value.distanceTo(REST) > 1e-9;
}

describe("GlintController", () => {
  it("is view-dependent on RICH and static on LITE", () => {
    const glint = new GlintController();
    expect(glint.configure("rich", false)).toBe(true);
    expect(glint.mode).toBe("view");
    expect(glint.active).toBe(true);
    expect(glint.configure("lite", false)).toBe(true);
    expect(glint.mode).toBe("static");
    expect(glint.active).toBe(false);
    expect(glint.configure("lite", false)).toBe(false);
  });

  it("moves the virtual light with the turn of the flake, and only then", () => {
    const glint = new GlintController();
    glint.configure("rich", false);
    // The first sample only records where the flake is.
    expect(glint.update(0, 0, 0)).toBe(false);
    expect(lightMoved(glint)).toBe(false);

    expect(glint.update(0.1, 0, 0)).toBe(true);
    expect(glint.lightPhase).toBeCloseTo(0.1 * GLINT_PHASE_GAIN, 9);
    const moved = glint.uniforms.uGlintLight.value.clone();

    // A still flake (idle frame): nothing changes, so the frame renders as the last one did.
    expect(glint.update(0.1, 0, 0)).toBe(false);
    expect(glint.uniforms.uGlintLight.value.equals(moved)).toBe(true);

    // Turning back is still a turn: phase tracks distance travelled, not direction.
    expect(glint.update(0, 0, 0)).toBe(true);
    expect(glint.lightPhase).toBeCloseTo(0.2 * GLINT_PHASE_GAIN, 9);
  });

  it("keeps the light a unit vector", () => {
    const glint = new GlintController();
    glint.configure("rich", false);
    glint.update(0, 0, 0);
    for (let i = 1; i < 40; i++) glint.update(i * 0.37, i * 0.11, i * 0.05);
    expect(glint.uniforms.uGlintLight.value.length()).toBeCloseTo(1, 9);
  });

  it("disables the glint update under reduced motion, whatever the tier", () => {
    const glint = new GlintController();
    // Reduced motion beats an explicit RICH choice.
    glint.configure("rich", true);
    expect(glint.mode).toBe("static");
    expect(glint.active).toBe(false);
    glint.update(0, 0, 0);
    expect(glint.update(1, 2, 3)).toBe(false);
    expect(glint.lightPhase).toBe(0);
    expect(lightMoved(glint)).toBe(false);
  });

  it("freezes the glint when motion is reduced mid-session", () => {
    const glint = new GlintController();
    glint.configure("rich", false);
    glint.update(0, 0, 0);
    glint.update(0.5, 0, 0);
    expect(glint.lightPhase).toBeGreaterThan(0);

    expect(glint.configure("rich", true)).toBe(true);
    expect(glint.mode).toBe("static");
    expect(glint.update(1, 1, 1)).toBe(false);
    // Back to the resting light: the static frame is the same on every visit.
    expect(glint.lightPhase).toBe(0);
    expect(lightMoved(glint)).toBe(false);
  });

  it("does no glint update work on LITE", () => {
    const glint = new GlintController();
    glint.configure("lite", false);
    glint.update(0, 0, 0);
    expect(glint.update(0.3, 0.2, 0.1)).toBe(false);
    expect(lightMoved(glint)).toBe(false);
  });

  it("restarts from the rest light when RICH comes back", () => {
    const glint = new GlintController();
    glint.configure("rich", false);
    glint.update(0, 0, 0);
    glint.update(1, 0, 0);
    glint.configure("lite", false);
    glint.configure("rich", false);
    expect(glint.lightPhase).toBe(0);
    // The first sample after a re-enable is a baseline, not a jump from the old pose.
    expect(glint.update(5, 5, 5)).toBe(false);
    expect(lightMoved(glint)).toBe(false);
  });
});

describe("glint material defines", () => {
  it("defines GLINT on RICH only and GLINT_STATIC on LITE only", () => {
    const glint = new GlintController();
    const material = new THREE.MeshPhysicalMaterial();
    glint.attach(material);

    glint.configure("rich", false);
    glint.syncDefines(material);
    expect(material.defines?.GLINT).toBe("1");
    expect(material.defines?.GLINT_STATIC).toBeUndefined();
    const richKey = material.customProgramCacheKey();

    glint.configure("lite", false);
    glint.syncDefines(material);
    expect(material.defines?.GLINT).toBeUndefined();
    expect(material.defines?.GLINT_STATIC).toBe("1");
    expect(material.customProgramCacheKey()).not.toBe(richKey);
  });

  it("keeps the physical material's own defines", () => {
    const glint = new GlintController();
    const material = new THREE.MeshPhysicalMaterial();
    glint.configure("rich", false);
    glint.syncDefines(material);
    expect(material.defines?.STANDARD).toBeDefined();
    expect(material.defines?.PHYSICAL).toBeDefined();
  });
});

describe("patchGlintShader", () => {
  const source = [
    "#include <common>",
    "void main() {",
    "  #include <fog_fragment>",
    "  #include <premultiplied_alpha_fragment>",
    "}",
  ].join("\n");

  it("adds the uniform, and puts both glint blocks after fog", () => {
    const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: source };
    const uniforms = new GlintController().uniforms;
    patchGlintShader(shader, uniforms);

    expect(shader.uniforms.uGlintLight).toBe(uniforms.uGlintLight);
    const fs = shader.fragmentShader;
    expect(fs.indexOf("uniform vec3 uGlintLight")).toBeGreaterThan(fs.indexOf("#include <common>"));
    const fog = fs.indexOf("#include <fog_fragment>");
    expect(fs.indexOf("glintSpec")).toBeGreaterThan(fog);
    expect(fs.indexOf("GLINT_STATIC")).toBeGreaterThan(fog);
    expect(fs.indexOf("glintSpec")).toBeLessThan(fs.indexOf("#include <premultiplied_alpha_fragment>"));
  });

  it("gates the view-dependent block on GLINT and the cheap block on GLINT_STATIC", () => {
    const shader = { uniforms: {}, fragmentShader: source };
    patchGlintShader(shader, new GlintController().uniforms);
    const fs = shader.fragmentShader;
    // Every glint statement sits inside an #if on its own define, so a shader compiled without
    // either define is the unpatched one.
    const stripped = fs
      .replace(/#if defined\( GLINT \)[\s\S]*?#endif/g, "")
      .replace(/#if defined\( GLINT_STATIC \)[\s\S]*?#endif/g, "");
    expect(stripped).not.toMatch(/glint|Glint/);
    expect(stripped.replace(/\s+/g, "")).toBe(source.replace(/\s+/g, ""));
  });

  it("reuses the roughness texel for the static glint: no extra sampler on LITE", () => {
    const shader = { uniforms: {}, fragmentShader: source };
    patchGlintShader(shader, new GlintController().uniforms);
    const staticBlock = shader.fragmentShader.match(/#if defined\( GLINT_STATIC \)[\s\S]*?#endif/)?.[0] ?? "";
    expect(staticBlock).toContain("texelRoughness");
    expect(staticBlock).not.toContain("texture2D");
  });

  it("keeps the tuning inside the range the baked facets can reach", () => {
    const c = GLINT_SHADER_CONSTANTS;
    expect(c.edge0).toBeLessThan(c.edge1);
    expect(c.edge1).toBeLessThan(1);
    expect(c.staticFrom).toBeLessThan(c.staticTo);
    expect(c.staticTo).toBeLessThanOrEqual(1);
  });
});
