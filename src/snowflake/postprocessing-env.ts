export interface PostprocessingSkipHints {
  prefersReducedMotion: boolean;
  saveData?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

type NavigatorHints = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

/** Skip bloom/DoF/SMAA on reduced motion, Save-Data, or a low-power client. */
export function shouldSkipPostprocessing(hints: PostprocessingSkipHints): boolean {
  if (hints.prefersReducedMotion) return true;
  if (hints.saveData) return true;
  if (typeof hints.deviceMemory === "number" && hints.deviceMemory > 0 && hints.deviceMemory <= 4) {
    return true;
  }
  if (
    typeof hints.hardwareConcurrency === "number" &&
    hints.hardwareConcurrency > 0 &&
    hints.hardwareConcurrency <= 2
  ) {
    return true;
  }
  return false;
}

export function skipPostprocessingFromEnvironment(
  prefersReducedMotion: boolean,
  nav: Navigator = navigator,
): boolean {
  const hints = nav as NavigatorHints;
  return shouldSkipPostprocessing({
    prefersReducedMotion,
    saveData: hints.connection?.saveData === true,
    deviceMemory: hints.deviceMemory,
    hardwareConcurrency: nav.hardwareConcurrency,
  });
}
