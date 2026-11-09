declare global {
  interface Window {
    __FROSTBOMB_LABEL_TIMEOUT__?: number;
    __FROSTBOMB_UNDO_TIMEOUT__?: number;
  }
}

type TimeoutOverride = "__FROSTBOMB_LABEL_TIMEOUT__" | "__FROSTBOMB_UNDO_TIMEOUT__";

export function testTimeoutOverride(name: TimeoutOverride, fallback: number): number {
  return window[name] ?? fallback;
}
