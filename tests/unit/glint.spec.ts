import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { FROST_SIZE, generateFrostBuffers } from "../../src/snowflake/frost-data.ts";
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
    expect(fs.indexOf("clamp( glintStaticMask")).toBeGreaterThan(fog);
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

  it("reads the static mask from the normal texel already fetched: no extra sampler on LITE", () => {
    const shader = { uniforms: {}, fragmentShader: `${source}\n#include <normal_fragment_maps>` };
    patchGlintShader(shader, new GlintController().uniforms);
    const fs = shader.fragmentShader;
    const staticBlock = fs.match(/#if defined\( GLINT_STATIC \)[\s\S]*?#endif/)?.[0] ?? "";
    expect(staticBlock).toContain("glintStaticMask");
    expect(staticBlock).not.toContain("texture2D");
    // The chunk is patched in place (its tangent-space fetch keeps the alpha), not fetched again.
    expect(fs).not.toContain("#include <normal_fragment_maps>");
    expect(fs).toContain("glintStaticMask = glintNormalTexel.a");
  });

  it("keeps the tuning inside the range the baked facets can reach", () => {
    const c = GLINT_SHADER_CONSTANTS;
    expect(c.edge0).toBeLessThan(c.edge1);
    expect(c.edge1).toBeLessThan(1);
    expect(c.staticFrom).toBeLessThan(c.staticTo);
    expect(c.staticTo).toBeLessThanOrEqual(1);
  });
});

function shaderStaticAmount(): (mask: number) => number {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    fragmentShader: ["void main() {", "#include <normal_fragment_maps>", "#include <fog_fragment>", "}"].join("\n"),
  };
  patchGlintShader(shader, new GlintController().uniforms);
  const fs = shader.fragmentShader;
  const read = /glintStaticMask = (.+);/.exec(fs);
  const amt = /float glintAmount = (clamp\( glintStaticMask .+?\));/.exec(fs);
  if (!read || !amt) throw new Error("static glint lines not found in the patched shader");
  const js = (e: string) => e.replace(/glintNormalTexel\.a/g, "m");
  return new Function(
    "m",
    `const step=(e,x)=>x<e?0:1, clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
     const glintStaticMask = ${js(read[1])}; return ${amt[1]};`,
  ) as (mask: number) => number;
}

describe("static glint mask under mip minification", () => {
  // Box-filtered mip chain of the baked static mask (normal alpha), as the GPU builds it.
  function maskMips(): Float32Array[] {
    const { normalData } = generateFrostBuffers();
    let level = new Float32Array(FROST_SIZE * FROST_SIZE);
    for (let i = 0; i < level.length; i++) level[i] = normalData[i * 4 + 3] / 255;
    const mips = [level];
    for (let n = FROST_SIZE / 2; n >= 1; n /= 2) {
      const next = new Float32Array(n * n);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = 2 * y * 2 * n + 2 * x;
          next[y * n + x] = (level[i] + level[i + 1] + level[i + 2 * n] + level[i + 2 * n + 1]) / 4;
        }
      }
      mips.push(next);
      level = next;
    }
    return mips;
  }
  // What the shader makes of a mask value: the static-glint lines are taken from the patched shader
  // itself and evaluated, so a change to the GLSL (e.g. thresholding the filtered mask) is tested.
  const amount = shaderStaticAmount();
  const VISIBLE = 0.1; // a lit texel after the shader gain (0.6)
  const LIT_MIN = 0.002; // ~1% of texels at mip 1-2, 0.4% at mip 3 (fewer, brightest facets only)

  it("still has lit texels at mip levels 1 to 3 (the 128, 64 and 32 texel tile)", () => {
    const mips = maskMips();
    for (const level of [1, 2, 3]) {
      const n = FROST_SIZE >> level;
      const lit = mips[level].filter((m) => amount(m) >= VISIBLE).length;
      // About 2.6% of the tile is static facet; minification must not lose it (it was 1.0%, 0%, 0%
      // of the texels when the mask was a threshold on the mip-filtered tilt channel).
      expect(lit / (n * n), `mip ${level}`).toBeGreaterThan(LIT_MIN);
      expect(Math.max(...mips[level].map(amount)), `mip ${level}`).toBeGreaterThan(0.1);
    }
  });

  it("evaluates the shader on mip levels 4-6 (thin arms): still sparkles, but stays sparse", () => {
    const mips = maskMips();
    for (const level of [4, 5, 6]) {
      const mean = mips[level].reduce((a, b) => a + b, 0) / mips[level].length;
      // Evaluate the shader on the shrunk texel (not on a threshold of the full-size one).
      expect(amount(mean), `mip ${level}`).toBeGreaterThan(0);
      expect(amount(mean), `mip ${level}`).toBeLessThan(0.05); // sparse: a thin arm does not wash out
    }
  });

  it("is zero off the static facets", () => {
    const { normalData } = generateFrostBuffers();
    let zero = 0;
    for (let i = 0; i < FROST_SIZE * FROST_SIZE; i++) if (normalData[i * 4 + 3] === 0) zero++;
    expect(zero / (FROST_SIZE * FROST_SIZE)).toBeGreaterThan(0.9);
  });
});
