import * as THREE from "three";
import { GLINT_STATIC_FROM, GLINT_STATIC_TO } from "./frost-data";
import type { QualityTier } from "./quality";

/**
 * Ice glints from the sparse flat facets baked into the frost roughness map (`frost-data.ts`:
 * red/blue = facet tilt xy, alpha = coverage). Both modes add white to `gl_FragColor` after fog
 * and tone mapping, and make the glint opaque (alpha up to 1). The flake renders at 0.9 opacity
 * through fog (and ACES on LITE), so it tops out near mid-grey; a glint added before those, or
 * left at 0.9 alpha, would barely rise above the surface and on RICH would not reach the bloom
 * threshold. Measured on the 8-bit output: glint peak 0.745 luma without the alpha raise.
 *
 * - `view` (RICH): a facet glints where its normal lines up with the half vector of a virtual
 *   light, behind a narrow smoothstep (a stepped specular), so it is view-dependent and blooms.
 *   There is no clock: the one uniform that moves, the virtual light direction, is driven by how
 *   far the flake has turned, so an idle frame renders identically to the last and nothing here
 *   keeps the animation loop alive.
 * - `static` (LITE, and reduced motion, which forces LITE): a fixed subset of the facets shows
 *   as a constant sparkle. Its mask is the alpha of the normal texel the shader already fetches
 *   (`frost-data.ts`), read through a small patch of the normal map chunk, so it adds a few ALU
 *   operations and no sampler, uniform or per-frame work. The mask is a coverage (the fraction of
 *   the pixel that is static facet), so it survives mip minification: a pixel that covers many
 *   facets gets the sparkle scaled by that fraction instead of losing it to an averaged threshold.
 */
export type GlintMode = "view" | "static";

/** Virtual light in view space (up, right, towards the camera), before any view-driven turn. */
const REST_LIGHT = new THREE.Vector3(0.35, 0.55, 0.76).normalize();
/** Virtual-light azimuth (radians) added per radian the flake turns: shimmer beyond plain geometry. */
export const GLINT_PHASE_GAIN = 0.6;

/** Fragment-shader tuning. A `view` facet glints when `dot(facetNormal, H)` is inside [edge0, edge1]. */
export const GLINT_SHADER_CONSTANTS = {
  /** Scale applied to the baked tangent-space tilt (|xy| of 0.7..0.97, so 20 to 29 degrees). */
  tilt: 0.5,
  edge0: 0.965,
  edge1: 0.985,
  /** Linear gain; anything past 1 saturates, so this only sets how soft the rim is. */
  gain: 3,
  /** `static` shows facets whose baked tilt-x channel (a stand-in for a random draw) is above this... */
  staticFrom: GLINT_STATIC_FROM,
  /** ...fully lit from here, so only the brightest few facets sparkle (sparse on LITE). */
  staticTo: GLINT_STATIC_TO,
  /**
   * `static` glint = clamp(mask * gain): the mask is the static-facet coverage of the pixel, ~1%
   * of the tile at mip 1, so a heavily minified pixel (a thin arm) brightens by ~0.6% (below what reads
   * as grain) while a pixel that lands on a facet still lights up. Gain 0.6 keeps thin arms sparse and keeps every 1 px tile under 3 flashes/s on LITE (flash-lite-*.json).
   */
  staticGain: 0.6,
} as const;

const GLINT_PARS = /* glsl */ `
#if defined( GLINT ) && defined( USE_NORMALMAP_TANGENTSPACE ) && defined( USE_ROUGHNESSMAP )
uniform vec3 uGlintLight;
#endif
#if defined( GLINT_STATIC ) && defined( USE_NORMALMAP_TANGENTSPACE )
float glintStaticMask = 0.0;
#endif
`;

/** The line of three's `normal_fragment_maps` chunk that samples the normal map (the one fetch). */
const NORMAL_MAP_FETCH = "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;";
const NORMAL_MAP_FETCH_KEEPING_ALPHA = /* glsl */ `
#if defined( GLINT_STATIC )
	vec4 glintNormalTexel = texture2D( normalMap, vNormalMapUv );
	glintStaticMask = glintNormalTexel.a;
	vec3 mapN = glintNormalTexel.xyz * 2.0 - 1.0;
#else
	${NORMAL_MAP_FETCH}
#endif`;

const GLINT_BODY = /* glsl */ `
#if defined( GLINT ) && defined( USE_NORMALMAP_TANGENTSPACE ) && defined( USE_ROUGHNESSMAP )
{
	// Red/blue = facet tilt xy (0.5 flat), alpha = facet coverage; zero outside facets.
	vec4 glintField = texture2D( roughnessMap, vRoughnessMapUv );
	if ( glintField.a > 0.02 ) {
		vec2 glintTilt = ( glintField.rb * 2.0 - 1.0 ) * ${GLINT_SHADER_CONSTANTS.tilt.toFixed(3)};
		vec3 glintNormal = normalize( tbn * vec3( glintTilt, sqrt( max( 1.0 - dot( glintTilt, glintTilt ), 0.0 ) ) ) );
		vec3 glintHalf = normalize( uGlintLight + normalize( vViewPosition ) );
		float glintSpec = smoothstep( ${GLINT_SHADER_CONSTANTS.edge0.toFixed(3)}, ${GLINT_SHADER_CONSTANTS.edge1.toFixed(3)}, dot( glintNormal, glintHalf ) );
		float glintAmount = glintSpec * glintField.a;
		gl_FragColor.rgb += vec3( 1.0, 0.97, 0.9 ) * ( glintAmount * ${GLINT_SHADER_CONSTANTS.gain.toFixed(2)} );
		gl_FragColor.a = max( gl_FragColor.a, glintAmount );
	}
}
#endif
#if defined( GLINT_STATIC ) && defined( USE_NORMALMAP_TANGENTSPACE )
	{
		float glintAmount = clamp( glintStaticMask * ${GLINT_SHADER_CONSTANTS.staticGain.toFixed(2)}, 0.0, 1.0 );
		gl_FragColor.rgb += vec3( 1.0, 0.97, 0.9 ) * glintAmount;
		gl_FragColor.a = max( gl_FragColor.a, glintAmount );
	}
#endif
`;

interface PatchableShader {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
}

/** Splice the glint uniforms and blocks into a `MeshPhysicalMaterial` fragment shader. */
export function patchGlintShader(
  shader: PatchableShader,
  uniforms: Record<string, { value: unknown }>,
): void {
  Object.assign(shader.uniforms, uniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <normal_fragment_maps>", () =>
      THREE.ShaderChunk.normal_fragment_maps.replace(NORMAL_MAP_FETCH, NORMAL_MAP_FETCH_KEEPING_ALPHA),
    )
    .replace("#include <common>", `#include <common>\n${GLINT_PARS}`)
    .replace("#include <fog_fragment>", `#include <fog_fragment>\n${GLINT_BODY}`);
}

export class GlintController {
  readonly uniforms = {
    uGlintLight: { value: REST_LIGHT.clone() },
  };

  private current: GlintMode = "static";
  private phase = 0;
  private last: [number, number, number] | null = null;

  get mode(): GlintMode {
    return this.current;
  }

  /** Whether the view-dependent RICH glint runs. Reduced motion wins over the tier. */
  get active(): boolean {
    return this.current === "view";
  }

  /** Current virtual-light azimuth offset in radians (0 at rest). */
  get lightPhase(): number {
    return this.phase;
  }

  /**
   * Choose the mode from the tier and motion preference: `view` only on RICH with motion allowed,
   * `static` otherwise. Returns whether the mode changed (the material needs a recompile).
   */
  configure(tier: QualityTier, prefersReducedMotion: boolean): boolean {
    const next: GlintMode = tier === "rich" && !prefersReducedMotion ? "view" : "static";
    if (next === this.current) return false;
    this.current = next;
    // Back to the resting light so a later re-enable (or the frozen frame) is deterministic.
    this.phase = 0;
    this.last = null;
    this.uniforms.uGlintLight.value.copy(REST_LIGHT);
    return true;
  }

  /**
   * Per-frame glint update from the flake's rotation (radians). Does nothing unless the mode is
   * `view`, so LITE and reduced motion pay nothing and a still flake leaves the light where it
   * was. Returns whether the light moved.
   */
  update(rotationX: number, rotationY: number, rotationZ: number): boolean {
    if (!this.active) return false;
    const last = this.last;
    this.last = [rotationX, rotationY, rotationZ];
    if (last === null) return false;
    const turned =
      Math.abs(rotationX - last[0]) + Math.abs(rotationY - last[1]) + Math.abs(rotationZ - last[2]);
    if (turned === 0) return false;
    this.phase = (this.phase + turned * GLINT_PHASE_GAIN) % (Math.PI * 2);
    const c = Math.cos(this.phase);
    const s = Math.sin(this.phase);
    this.uniforms.uGlintLight.value.set(
      REST_LIGHT.x * c - REST_LIGHT.y * s,
      REST_LIGHT.x * s + REST_LIGHT.y * c,
      REST_LIGHT.z,
    );
    return true;
  }

  /** Install the shader patch and cache key. Call once; pair with {@link syncDefines}. */
  attach(material: THREE.Material): void {
    material.onBeforeCompile = (shader) => patchGlintShader(shader, this.uniforms);
    material.customProgramCacheKey = () => `glint-${this.current}`;
  }

  /** Mirror the mode into the material's `GLINT` / `GLINT_STATIC` defines. The caller sets `needsUpdate`. */
  syncDefines(material: THREE.Material): void {
    material.defines ??= {};
    delete material.defines.GLINT;
    delete material.defines.GLINT_STATIC;
    if (this.current === "view") material.defines.GLINT = "1";
    else material.defines.GLINT_STATIC = "1";
  }
}
