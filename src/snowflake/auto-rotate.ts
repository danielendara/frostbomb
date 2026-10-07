export interface AutoRotateState {
  autoTime: number;
  x: number;
  y: number;
  z: number;
}

export const INITIAL_AUTO_ROTATE: AutoRotateState = { autoTime: 0, x: 0, y: 0, z: 0 };

/**
 * Advances the auto-rotate phase only while enabled; while disabled the last
 * applied angles are held so the crystal freezes instead of snapping to zero.
 */
export function advanceAutoRotate(
  state: AutoRotateState,
  delta: number,
  enabled: boolean,
): AutoRotateState {
  if (!enabled) return state;
  const t = state.autoTime + delta;
  return {
    autoTime: t,
    z: t * 0.08 + Math.sin(t * 0.3) * 0.04,
    y: Math.sin(t * 0.2) * 0.05,
    x: Math.cos(t * 0.25) * 0.03,
  };
}
