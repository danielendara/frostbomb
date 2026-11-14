declare global {
  interface Window {
    __FROSTBOMB_LABEL_TIMEOUT__?: number;
    __FROSTBOMB_UNDO_TIMEOUT__?: number;
    __FROSTBOMB_DOWNLOAD_GAP_MS__?: number;
    __FROSTBOMB_OBJECT_URL_REVOKE_MS__?: number;
    __FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__?: number;
  }
}

type TimeoutOverride =
  | "__FROSTBOMB_LABEL_TIMEOUT__"
  | "__FROSTBOMB_UNDO_TIMEOUT__"
  | "__FROSTBOMB_DOWNLOAD_GAP_MS__"
  | "__FROSTBOMB_OBJECT_URL_REVOKE_MS__"
  | "__FROSTBOMB_QUALITY_DEMOTION_NOTICE_MS__";

/** Dev-only e2e timing override; production builds always get `fallback`. */
export function testTimeoutOverride(name: TimeoutOverride, fallback: number): number {
  if (!import.meta.env.DEV) return fallback;
  const value = window[name];
  return typeof value === "number" ? value : fallback;
}
