/** App-specific startup marks. Lighthouse cannot infer these from canvas content. */
export const MARK_FIRST_FLAKE_BUILT = "frostbomb:first-flake-built";
export const MARK_FIRST_FRAME_RENDERED = "frostbomb:first-frame-rendered";
export const MARK_POSTPROCESSING_READY = "frostbomb:postprocessing-ready";
export const MARK_WEBGL_SCENE_CREATE_BEGIN = "frostbomb:webgl-scene-create-begin";
export const MARK_WEBGL_SCENE_CREATE_END = "frostbomb:webgl-scene-create-end";

const marked = new Set<string>();

export function markOnce(name: string): void {
  if (marked.has(name)) return;
  marked.add(name);
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(name);
  try {
    performance.measure(`${name}:since-nav`, { start: 0, end: name });
  } catch {
    // Measure is optional; the mark is the contract for tests and DevTools.
  }
}

export function hasMark(name: string): boolean {
  return marked.has(name);
}

/** Test-only: clear recorded marks so specs can re-run in one process. */
export function resetPerfMarksForTests(): void {
  marked.clear();
  if (typeof performance === "undefined") return;
  if (typeof performance.clearMarks === "function") performance.clearMarks();
  if (typeof performance.clearMeasures === "function") performance.clearMeasures();
}
