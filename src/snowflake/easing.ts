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
export function easeOutExpoFast(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return EASING_LUT[(t * (EASING_LUT_SIZE - 1)) | 0];
}

/**
 * Performance Optimization: Unchecked version of easing for hot loops where 't'
 * is already guaranteed to be in (0, 1).
 */
export function easeOutExpoUnchecked(t: number): number {
  return EASING_LUT[(t * (EASING_LUT_SIZE - 1)) | 0];
}
