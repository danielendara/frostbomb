import "./style.css";
import { yieldToMain } from "./lib/yield-to-main";
import {
  markMainModuleFinished,
  scheduleDeferredSceneInit,
  yieldToNextFrame,
} from "./snowflake/schedule-scene-init";
import type { Scene } from "./snowflake/scene";
import {
  WEBGL_UNAVAILABLE_ANNOUNCEMENT,
  createInertScene,
  hasWebGL2,
  showWebglFallback,
} from "./snowflake/webgl-fallback";
import {
  WEBGL_CONTEXT_LOST_ANNOUNCEMENT,
  showReloadCrystalAffordance,
} from "./snowflake/context-loss";
import { buildSnowflake, buildSnowflakeAsync, type BuildResult } from "./snowflake/geometry";
import { buildSnowflakeSvg } from "./snowflake/svg-export";
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from "./snowflake/nakaya";
import { initNakayaDiagram } from "./snowflake/diagram";
import { initHabitChips, syncHabitChips } from "./ui/habit-presets";
import { mulberry32, resolveSeed, randomSeed, dailySeed, hashString, Rand } from "./snowflake/random";
import { copyTextToClipboard } from "./ui/clipboard";
import { createPhotoMode } from "./ui/photo-mode";
import { announce as announceRaw } from "./ui/announcer";
import { MODE_TOGGLES, syncModeToggleButton, type ShareModeKind } from "./ui/mode-toggle";
import { commitNakayaConditions, updateNakayaStatus } from "./ui/nakaya-status";
import {
  visualPress,
  setTemporaryLabel,
  triggerFlash,
  setText,
  updateRowAria,
} from "./ui/feedback";
import { SeedHistoryManager } from "./ui/history";
import { LabPanel } from "./ui/lab-panel";
import { initKeyboardShortcuts } from "./ui/keyboard";
import {
  downloadHref,
  downloadObjectUrls,
  filesForExportIdentity,
  formatExportFileName,
} from "./ui/download";
import { runExportAction } from "./ui/export-action";
import { captureWallpaper, wallpaperFileName, wallpaperSize } from "./ui/wallpaper";
import { canShareFiles, drawOnOpaqueCanvas, shareSnowflake } from "./ui/share-image";
import { installStaleBuildRecovery, sessionStorageOrNull } from "./ui/stale-build";
import { installClientErrorReporting, reportClientError } from "./ui/client-error";
import { createUrlWriteCoalescer } from "./url-write-coalescer";
import {
  MARK_FIRST_FLAKE_BUILT,
  MARK_WEBGL_SCENE_CREATE_BEGIN,
  MARK_WEBGL_SCENE_CREATE_END,
  markOnce,
} from "./snowflake/perf-marks";
import { NAKAYA_NAV_KEYS, nakayaKeyStep, nakayaPointToConditions } from "./ui/nakaya-input";
import { effectiveRotateFlag, loadModePrefs, resolveRotatePref, saveModePrefs as writeModePrefs } from "./mode-prefs";
import {
  crystalStatesEqual,
  parseCrystalUrlState,
  quantizeLabConditions,
  resolveModes,
  retainedLabConditions,
  writeCrystalGeneration,
  type CrystalUrlState,
  type GenerationProvenance,
  type ModeSource,
} from "./url-state";
import {
  SHARE_PARAM_LAB,
  SHARE_PARAM_PINK,
  SHARE_PARAM_PRISM,
  SHARE_PARAM_ROTATE,
  SHARE_PARAM_SEED,
  readShareFlag,
  setShareFlag,
  type ShareFlagName,
} from "./share-url-params";

/**
 * Restoring a history entry re-applies look modes through the same toggles a
 * click uses, and each of those announces. During a restore the single
 * "restored seed X" line is the useful one, so per-mode chatter is suppressed.
 */
let restoringHistory = false;

function announce(message: string): void {
  if (restoringHistory) return;
  announceRaw(message);
}

// Before anything else can fail: uncaught errors and handled failure paths
// below go to Workers Logs via /api/client-error (#356).
installClientErrorReporting();

const canvas = document.getElementById("scene") as HTMLCanvasElement;
// No WebGL2 (or the renderer fails to build): static flake, no 3D actions.
let webglFallback = !hasWebGL2();
let sceneGpuReady = false;
let scene: Scene = createInertScene();

function canUseGpuScene(): boolean {
  return !webglFallback && sceneGpuReady;
}

function waitForGpuScene(maxMs = 15_000): Promise<boolean> {
  if (webglFallback) return Promise.resolve(false);
  if (sceneGpuReady) return Promise.resolve(true);
  return new Promise((resolve) => {
    const started = performance.now();
    const tick = () => {
      if (sceneGpuReady) {
        resolve(true);
        return;
      }
      if (performance.now() - started >= maxMs) {
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function captureSceneVisualState() {
  return {
    pink: scene.isPinkModeEnabled,
    prism: scene.isPrismModeEnabled,
    rotate: scene.isAutoRotateEnabled,
  };
}

function applySceneVisualState(
  target: Scene,
  state: ReturnType<typeof captureSceneVisualState>,
): void {
  target.setPinkMode(state.pink);
  target.setPrismMode(state.prism);
  target.setAutoRotate(state.rotate);
}

async function mountGpuScene(): Promise<void> {
  if (webglFallback) return;
  const visual = captureSceneVisualState();
  try {
    const { warmSceneModule, createScene } = await import("./snowflake/scene");
    await warmSceneModule();
    await yieldToNextFrame();
    await yieldToMain();
    markOnce(MARK_WEBGL_SCENE_CREATE_BEGIN);
    const gpuScene = await createScene(canvas, {
      onContextLost: () => {
        reportClientError("webgl-context-lost", "WebGL context lost");
        announce(WEBGL_CONTEXT_LOST_ANNOUNCEMENT);
        showReloadCrystalAffordance();
      },
    });
    markOnce(MARK_WEBGL_SCENE_CREATE_END);
    scene = gpuScene;
    sceneGpuReady = true;
    canvas.setAttribute("data-scene-gpu", "true");
    applySceneVisualState(scene, visual);
    await yieldToMain();
  } catch (error) {
    webglFallback = true;
    sceneGpuReady = false;
    reportClientError("webgl-unavailable", error);
    scene = createInertScene();
    showWebglFallback(canvas);
    announce(WEBGL_UNAVAILABLE_ANNOUNCEMENT);
    updateRotateButtonUI();
  }
}

async function finishGpuSceneBoot(): Promise<void> {
  if (webglFallback || !sceneGpuReady) return;
  try {
    if (lastFlake) {
      await yieldToMain();
      await scene.updateFlakeAsync(lastFlake, true);
    }
    await yieldToMain();
    await scene.prepareForFirstFrame();
    await yieldToMain();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    scene.start();
    updateRotateButtonUI();
  } catch (error) {
  }
}

if (webglFallback) {
  reportClientError("webgl-unavailable", "WebGL2 unavailable");
  showWebglFallback(canvas);
  announce(WEBGL_UNAVAILABLE_ANNOUNCEMENT);
}

document.getElementById("btn-reload-crystal")?.addEventListener("click", () => {
  window.location.reload();
});

// A tab that predates a deploy can't load its old hashed chunks (Lab, 3D
// export, effects): reload once so it picks up the new build (#333). A fresh
// visit's address bar is still bare (#316), so write seed + look first and
// the reload regrows this exact crystal.
installStaleBuildRecovery({
  storage: sessionStorageOrNull(),
  now: Date.now,
  reload: () => {
    reportClientError("chunk-reload", "Stale build: reloading after a chunk preload error");
    syncCrystalUrl(currentSeedLabel, currentConditions, "replace");
    window.location.reload();
  },
});

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const nakayaCanvas = document.getElementById("nakaya-diagram") as HTMLCanvasElement;
let nakayaDiagram: Awaited<ReturnType<typeof initNakayaDiagram>> = null;
void initNakayaDiagram(nakayaCanvas).then((diagram) => {
  nakayaDiagram = diagram;
});

// Change detection cache for DOM attributes
let lastNakayaAria = "";
let lastCanvasAria = "";
let lastSeedAria = "";
let lastTitle = "";

let isLabMode = false;
let isGuideOpen = false;
let guideReturnTarget: HTMLElement | null = null;
let currentConditions: GrowthConditions;
/** Sampled crystals replay the seed path. Only a real Lab commit is manual. */
let generationProvenance: GenerationProvenance = "sampled";
let lastHabit: string | null = null;
let currentSeedLabel: string;
let currentSeed: { seed: number; label: string } | null = null;
let lastFlake: BuildResult | null = null;
let labToggleGeneration = 0;

// History Manager
const historyManager = new SeedHistoryManager({
  onExternalChange: () => updateRecentSeedsUI(),
  onSelectSeed: (seedVal) => {
    urlWrites.flush();
    if (seedVal === currentSeedLabel) {
      announce(`Seed ${seedVal} is already active`);
      return;
    }
    currentSeed = {
      seed: hashString(seedVal),
      label: seedVal,
    };
    const { conditions } = grow(undefined, true, true);
    // Deliberate crystal change → its own history entry (#316).
    syncCrystalUrl(seedVal, conditions, "push");
    announce(`Loaded seed ${seedVal}: ${habitLabel[conditions.habit]}`);
  },
});

/**
 * Tweakpane's `refresh()` snaps the value to its step grid and re-emits
 * `change`, which would run a nested `updateFromPane()` that *replaces* the
 * history entry before a habit chip's deliberate push lands, overwriting the
 * previous entry so Back skips it. The chip tap applies its own preset, so it
 * ignores those refresh-driven events.
 */
let suppressPaneChange = false;

// Lab Panel
// Incidental replace writes from Nakaya drags / slider changes (>= 150 ms apart).
// Rebuilds from current state when it runs; every other URL write is immediate.
const urlWrites = createUrlWriteCoalescer(
  () => syncCrystalUrl(currentSeedLabel, currentConditions, "replace"),
  150,
);

const labPanel = new LabPanel({
  getCurrentSeedLabel: () => currentSeedLabel,
  getQualityTier: () => scene.qualityTier,
  onQualityChange: (tier) => scene.setQualityTier(tier),
  onSeedChange: (val) => {
    urlWrites.flush();
    currentSeed = {
      seed: hashString(val),
      label: val,
    };
    const { conditions } = grow(retainedManualConditions(), true, false);
    syncCrystalUrl(val, conditions, "push");

    announce(`Seed changed to ${val}`);
  },
  onRandomizeSeed: () => {
    urlWrites.flush();
    // Roll explicitly — the address bar always carries a seed now, so
    // re-reading it would hand back the same crystal (#316).
    const result = grow(retainedManualConditions(), false, false, undefined, randomSeed());
    syncCrystalUrl(result.label, result.conditions, "push");
    announce(`Randomized seed to ${result.label}`);
  },
  onConditionsChange: (_temp, _ss, last) => {
    if (suppressPaneChange) return;
    updateFromPane();
    if (last) urlWrites.flush();
  },
});

function updateRecentSeedsUI() {
  historyManager.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
}

document.getElementById("btn-clear-history")?.addEventListener("click", () => {
  visualPress("btn-clear-history");
  historyManager.clear(currentSeedLabel, isLabMode, isGuideOpen);
});

function grow(
  manualConditions?: GrowthConditions,
  keepSeed = false,
  animate = true,
  previewPoint?: { temp: number; ss: number },
  /** Explicit seed for a deliberate change, instead of re-reading the URL. */
  forcedSeed?: { seed: number; label: string },
  /** Pre-built geometry (e.g. from the worker on cold boot). */
  prebuilt?: BuildResult,
  /** When `skip`, caller applies the flake to the scene (async boot path). */
  sceneUpdate: "sync" | "skip" = "sync",
) {
  const isNewSeed = !keepSeed || !currentSeed || Boolean(forcedSeed);
  if (isNewSeed) {
    currentSeed = forcedSeed ?? resolveSeed();
  }

  const { seed, label } = currentSeed!;
  currentSeedLabel = label;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  // A passed condition set is a manual fixed point. Otherwise resample so the
  // atmospheric path stays a function of the seed (the URL can replay that).
  const conditions = manualConditions || sampleConditions(rand);
  generationProvenance = manualConditions ? "manual" : "sampled";
  currentConditions = conditions;
  const result = prebuilt ?? buildSnowflake(conditions, rand);
  lastFlake = result;
  markOnce(MARK_FIRST_FLAKE_BUILT);

  if (sceneUpdate === "sync") {
    scene.updateFlake(result, animate);
  }
  const isCanvasFocused = document.activeElement === nakayaCanvas;
  nakayaDiagram?.update(
    conditions.path,
    previewPoint ||
      (isCanvasFocused
        ? { temp: conditions.temperatureC, ss: conditions.supersaturation }
        : undefined)
  );

  if (canvas) {
    const canvasAria = `Interactive 3D snowflake: a ${habitLabel[conditions.habit]} (Seed: ${label}). Drag to rotate, arrow keys to orbit, double-click or V to reset view.`;
    if (lastCanvasAria !== canvasAria) {
      canvas.setAttribute("aria-label", canvasAria);
      lastCanvasAria = canvasAria;
    }
  }

  const title = `${habitLabel[conditions.habit]} · ${label} — frostbomb`;
  if (lastTitle !== title) {
    document.title = title;
    lastTitle = title;
  }

  const btnSeed = document.getElementById("btn-seed");
  if (btnSeed) {
    const seedAria = `Copy share link for seed ${label}`;
    if (lastSeedAria !== seedAria) {
      if (btnSeed.hasAttribute("data-original-aria-label")) {
        btnSeed.setAttribute("data-original-aria-label", seedAria);
      } else {
        btnSeed.setAttribute("aria-label", seedAria);
      }
      lastSeedAria = seedAria;
    }
  }

  const tempF = (conditions.temperatureC * 9) / 5 + 32;
  const tempText = `${conditions.temperatureC.toFixed(1)} °C / ${tempF.toFixed(1)} °F`;
  const humidText = `${(conditions.supersaturation * 100).toFixed(0)}%`;
  const habitText = habitLabel[conditions.habit];

  setText("seed-display", label);
  setText("stat-temp", tempText);
  setText("stat-humid", humidText);
  setText("stat-habit", habitText);
  // The one place #stat-habit is written, so the Lab habit chips follow every
  // path (sliders, diagram, keyboard, new seeds, Back/forward restores).
  syncHabitChips(document, conditions.habit);

  const habitChanged = lastHabit && lastHabit !== habitText;
  if ((animate && isNewSeed) || habitChanged) {
    const animateIds = animate && isNewSeed ? ["stat-habit", "seed-display"] : ["stat-habit"];
    animateIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove("section-highlight");
        void el.offsetWidth;
        el.classList.add("section-highlight");
      }
    });
  }
  lastHabit = habitText;

  setText("stat-branches", `${result.branchCount}`);

  updateRowAria("stat-temp", "Temperature", tempText);
  updateRowAria("stat-humid", "Supersaturation", humidText);
  updateRowAria("stat-habit", "Habit", habitText);
  updateRowAria("stat-branches", "Branches", `${result.branchCount}`);

  labPanel.syncParams(label, habitText, conditions.temperatureC, conditions.supersaturation * 100);

  historyManager.addSeed(label);
  updateRecentSeedsUI();

  updateNakayaStatus(conditions.temperatureC, conditions.supersaturation, false);

  return { conditions, label };
}

function handleRefresh(e?: Event) {
  if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
  if (e) e.preventDefault();
  visualPress("refresh");
  const wordmark = document.querySelector(".wordmark-link");
  if (wordmark) visualPress(wordmark as HTMLElement);
  const dot = document.querySelector(".wordmark__accent");
  if (dot) {
    dot.classList.remove("animate-spin-once");
    void (dot as HTMLElement).offsetWidth;
    dot.classList.add("animate-spin-once");
  }
  const refreshIcon = document.querySelector("#refresh .refresh__icon");
  if (refreshIcon) {
    refreshIcon.classList.remove("animate-spin-once");
    void (refreshIcon as HTMLElement).offsetWidth;
    refreshIcon.classList.add("animate-spin-once");
  }
  // Roll the new seed explicitly rather than deleting `?seed=` first: that
  // rewrite used to destroy the entry Back needs to return to (#316).
  const { conditions, label } = growAndPush(randomSeed());
  announce(`New snowflake grown: ${habitLabel[conditions.habit]} (Seed: ${label})`);
}

/**
 * Deliberate crystal change: grow the given seed on the regrow path (Back
 * history entry, Recent Seeds, `?seed=`), keeping a manual Lab point the same
 * way Regrow does.
 */
function growAndPush(forcedSeed: { seed: number; label: string }) {
  // Land a pending drag write on the current entry before this push, so Back returns to the final drag point.
  urlWrites.flush();
  const { conditions, label } = grow(
    retainedManualConditions(),
    false,
    true,
    undefined,
    forcedSeed,
  );
  syncCrystalUrl(label, conditions, "push");
  return { conditions, label };
}

function handleDailyCrystal(e?: Event) {
  if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
  if (e) e.preventDefault();
  visualPress("btn-daily");
  const label = dailySeed(new Date());
  const grown = growAndPush({ seed: hashString(label), label });
  announce(
    `Today's crystal grown: ${habitLabel[grown.conditions.habit]} (Seed: ${grown.label})`,
  );
}

document.getElementById("refresh")?.addEventListener("click", handleRefresh);
document.querySelector(".wordmark-link")?.addEventListener("click", handleRefresh);
document.getElementById("btn-daily")?.addEventListener("click", handleDailyCrystal);

const labToggle = document.getElementById("lab-toggle");
const guideToggle = document.getElementById("guide-toggle");
const labControls = document.getElementById("lab-controls");
const fieldGuide = document.getElementById("field-guide");
const statsDisplay = document.getElementById("stats-display");
const labStatus = document.getElementById("lab-status");

async function toggleLabMode(focusControls: boolean | Event = true) {
  const shouldFocus =
    focusControls === true || (typeof focusControls !== "boolean" && focusControls instanceof Event);
  isLabMode = !isLabMode;
  visualPress("lab-toggle");
  const toggleGeneration = ++labToggleGeneration;

  if (labToggle) {
    labToggle.setAttribute("aria-pressed", isLabMode.toString());
    labToggle.setAttribute("aria-expanded", isLabMode.toString());
  }
  if (nakayaCanvas) {
    nakayaCanvas.setAttribute("aria-pressed", isLabMode.toString());
    nakayaCanvas.setAttribute("aria-expanded", isLabMode.toString());
  }
  if (labControls) labControls.style.display = isLabMode ? "flex" : "none";
  if (statsDisplay) statsDisplay.style.display = isGuideOpen ? "none" : "flex";
  if (labStatus) {
    labStatus.textContent = isLabMode ? "ON" : "OFF";
  }

  persistModePrefs();

  updateRecentSeedsUI();

  if (isLabMode) {
    announce("Lab Mode active");
    if (!labPanel.isLoaded() && labStatus) {
      labStatus.textContent = "LOADING...";
      if (labToggle instanceof HTMLButtonElement) labToggle.disabled = true;
      announce("Loading lab controls");
    }
    try {
      await labPanel.ensurePane();
      labPanel.syncQuality(scene.qualityTier);
    } catch (err) {
      console.error("Failed to load Lab Mode:", err);
      reportClientError("chunk-load", err);
      if (labStatus) {
        labStatus.textContent = "ERROR";
        labStatus.classList.add("btn--error");
      }
      isLabMode = false;
      // Shell is shown before the chunk loads. Re-enable before focus: a
      // disabled button cannot take it, and finally runs too late to help.
      if (labControls) labControls.style.display = "none";
      if (nakayaCanvas) {
        nakayaCanvas.setAttribute("aria-pressed", "false");
        nakayaCanvas.setAttribute("aria-expanded", "false");
      }
      if (labToggle) {
        labToggle.setAttribute("aria-pressed", "false");
        labToggle.setAttribute("aria-expanded", "false");
        if (labToggle instanceof HTMLButtonElement) labToggle.disabled = false;
        labToggle.focus();
      }
      updateRecentSeedsUI();
      announce("Failed to load Lab Mode controls");
      persistModePrefs();
      syncCrystalUrl(currentSeedLabel, currentConditions, "replace");
      return;
    } finally {
      if (labToggle instanceof HTMLButtonElement) labToggle.disabled = false;
    }
    if (!isLabMode || toggleGeneration !== labToggleGeneration) return;
    if (labStatus) {
      labStatus.textContent = "ON";
      labStatus.classList.remove("btn--error");
    }
    updateFromPane();
    if (shouldFocus) {
      requestAnimationFrame(() => {
        if (labControls) {
          labControls.focus();
        }
      });
    }
  } else {
    grow(undefined, true);
    announce("Lab Mode disabled");
    if (labToggle) labToggle.focus();
  }
  persistModePrefs();
  syncCrystalUrl(currentSeedLabel, currentConditions, "replace");
}

function toggleFieldGuide(target: HTMLElement | null | Event = null) {
  isGuideOpen = !isGuideOpen;
  visualPress("guide-toggle");

  if (isGuideOpen && target instanceof HTMLElement) {
    guideReturnTarget = target;
  }

  if (guideToggle) {
    guideToggle.setAttribute("aria-pressed", isGuideOpen.toString());
    guideToggle.setAttribute("aria-expanded", isGuideOpen.toString());
  }
  if (fieldGuide) {
    fieldGuide.style.display = isGuideOpen ? "block" : "none";
    if (isGuideOpen) {
      fieldGuide.scrollTop = 0;
      fieldGuide.focus();
    } else {
      const restoreTo = guideReturnTarget || guideToggle;
      requestAnimationFrame(() => restoreTo?.focus());
      guideReturnTarget = null;

      // Reset aria-expanded on growth condition rows when guide closes
      document.querySelectorAll('.field-notes__row[role="button"]').forEach((row) => {
        row.setAttribute('aria-expanded', 'false');
      });
    }
  }
  if (statsDisplay) statsDisplay.style.display = isGuideOpen ? "none" : "flex";

  updateRecentSeedsUI();
}

function navigateToGuideSection(targetId: string, returnTarget: HTMLElement | null = null) {
  if (!isGuideOpen) {
    toggleFieldGuide(returnTarget);
  } else if (returnTarget) {
    guideReturnTarget = returnTarget;
  }

  // Update aria-expanded on growth condition rows based on target section
  document.querySelectorAll('.field-notes__row[role="button"]').forEach((row) => {
    const rowControls = row.getAttribute('aria-controls');
    row.setAttribute('aria-expanded', rowControls === targetId ? 'true' : 'false');
  });

  requestAnimationFrame(() => {
    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior: motionQuery.matches ? "auto" : "smooth", block: "start" });
      el.focus();
      el.classList.remove("section-highlight");
      void el.offsetWidth;
      el.classList.add("section-highlight");
    }
  });
}

labToggle?.addEventListener("click", toggleLabMode);
guideToggle?.addEventListener("click", toggleFieldGuide);
document.getElementById("guide-close")?.addEventListener("click", (e) => {
  visualPress("guide-close");
  toggleFieldGuide(e);
});
document.getElementById("lab-close")?.addEventListener("click", () => {
  visualPress("lab-close");
  toggleLabMode();
});

document.querySelectorAll('.field-notes__row[role="button"]').forEach((row) => {
  const handler = () => {
    visualPress(row as HTMLElement);
    const label = row.querySelector("dt")?.textContent?.trim();
    const targets: Record<string, string> = {
      Temperature: "guide-temp",
      Supersaturation: "guide-humid",
      Habit: "guide-habit",
      Branches: "guide-branches",
    };
    const targetId = targets[label || ""];

    if (targetId) {
      navigateToGuideSection(targetId, row as HTMLElement);
    }
  };

  row.addEventListener("click", handler);
  row.addEventListener("keydown", (e) => {
    const ke = e as KeyboardEvent;
    if (ke.key === "Enter" || ke.key === " ") {
      e.preventDefault();
      handler();
    }
  });
});

function handleNakayaPointer(e: PointerEvent) {
  if (!nakayaCanvas) return;
  if (e.type === "pointerdown") {
    visualPress("nakaya-diagram");
  }
  const rect = nakayaCanvas.getBoundingClientRect();
  const { temperatureC: t, ss } = nakayaPointToConditions(e.clientX, e.clientY, rect);

  labPanel.params.temperature = t;
  labPanel.params.supersaturation = ss * 100;

  if (!isLabMode) {
    toggleLabMode(false);
  } else {
    updateFromPane();
  }
}

nakayaCanvas?.addEventListener("pointerdown", (e) => {
  nakayaCanvas.setPointerCapture(e.pointerId);
  handleNakayaPointer(e);
});

nakayaCanvas?.addEventListener("pointermove", (e) => {
  if (e.buttons > 0) {
    handleNakayaPointer(e);
  } else {
    const rect = nakayaCanvas.getBoundingClientRect();
    const { temperatureC: t, ss } = nakayaPointToConditions(e.clientX, e.clientY, rect);
    updateNakayaStatus(t, ss, true);

    if (currentConditions) {
      nakayaDiagram?.update(currentConditions.path, { temp: t, ss });
    }
  }
});

nakayaCanvas?.addEventListener("pointerleave", () => {
  if (currentConditions) {
    updateNakayaStatus(currentConditions.temperatureC, currentConditions.supersaturation, false);
    if (document.activeElement === nakayaCanvas) {
      nakayaDiagram?.update(currentConditions.path, {
        temp: currentConditions.temperatureC,
        ss: currentConditions.supersaturation,
      });
    } else {
      nakayaDiagram?.update(currentConditions.path);
    }
  }
});

nakayaCanvas?.addEventListener("focus", () => {
  if (currentConditions) {
    nakayaDiagram?.update(currentConditions.path, {
      temp: currentConditions.temperatureC,
      ss: currentConditions.supersaturation,
    });
  }
});

nakayaCanvas?.addEventListener("blur", () => {
  if (currentConditions) {
    nakayaDiagram?.update(currentConditions.path);
  }
});

nakayaCanvas?.addEventListener("keydown", (e: Event) => {
  const { key } = e as KeyboardEvent;
  const isNav = NAKAYA_NAV_KEYS.includes(key);
  const isAction = key === " " || key === "Enter";

  if (isNav || isAction) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLabMode) {
      toggleLabMode(false);
    }

    if (isNav) {
      const next = nakayaKeyStep(key, (e as KeyboardEvent).shiftKey, labPanel.params);
      if (next) {
        labPanel.params.temperature = next.temperature;
        labPanel.params.supersaturation = next.supersaturation;
        visualPress("nakaya-diagram");
        updateFromPane();
      }
    }
  }
});

/**
 * `history` is "replace" for incidental tweaks (slider drags coalesce into the
 * current entry); a habit chip is a deliberate jump and passes "push" so one
 * Back step undoes it.
 */
function updateFromPane(history: "push" | "replace" = "replace") {
  if (history === "push") urlWrites.flush();
  const { habitText, conditions } = commitNakayaConditions({
    temperatureC: labPanel.params.temperature,
    supersaturation: labPanel.params.supersaturation / 100,
    isGuideOpen,
    lastHabit,
    announce,
  });

  if (nakayaCanvas) {
    const nakayaAria = `Nakaya morphology diagram: ${labPanel.params.temperature.toFixed(1)}°C, ${labPanel.params.supersaturation.toFixed(0)}% humidity. Resulting habit: ${habitText}. Use arrow keys to adjust.`;
    if (lastNakayaAria !== nakayaAria) {
      nakayaCanvas.setAttribute("aria-label", nakayaAria);
      lastNakayaAria = nakayaAria;
    }
  }

  labPanel.params.habit = habitText;
  labPanel.refresh();

  grow(conditions, true, false);

  // Default: an incidental tweak coalesces into the current entry rather than
  // pushing one history step per slider frame, and the write is time-throttled.
  if (history === "replace") {
    urlWrites.request();
  } else {
    syncCrystalUrl(currentSeedLabel, conditions, history);
  }
}

// Habit chips (#376). They live in #lab-controls, which is hidden until Lab
// Mode is on, so a tap always lands with Lab already on.
const habitChips = document.getElementById("habit-chips");
if (habitChips) {
  initHabitChips(habitChips, (_habit, preset) => {
    // The shell shows before the Tweakpane chunk loads; the load's own
    // updateFromPane() would overwrite a tap made in that window.
    if (!labPanel.isLoaded()) return;
    labPanel.params.temperature = preset.temp;
    labPanel.params.supersaturation = preset.ss * 100;
    suppressPaneChange = true;
    try {
      updateFromPane("push");
    } finally {
      suppressPaneChange = false;
    }
  });
}

function shareSearchParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set(SHARE_PARAM_SEED, currentSeedLabel);
  writeCurrentModeParams(params);
  writeCrystalGeneration(params, generationProvenance, currentConditions ?? null);
  return params;
}

/**
 * Manual Lab may follow a seed change. A sampled path may not — it was drawn
 * from the previous seed and the URL does not record it.
 */
function retainedManualConditions(): GrowthConditions | undefined {
  const lab = retainedLabConditions(
    generationProvenance,
    currentConditions
      ? {
          temperatureC: currentConditions.temperatureC,
          supersaturation: currentConditions.supersaturation,
        }
      : null,
  );
  if (!lab) return undefined;
  return {
    temperatureC: lab.temperatureC,
    supersaturation: lab.supersaturation,
    habit: getHabit(lab.temperatureC, lab.supersaturation),
    path: [{ temp: lab.temperatureC, ss: lab.supersaturation }],
  };
}

function buildShareUrl(): string {
  return `${window.location.origin}${window.location.pathname}?${shareSearchParams().toString()}`;
}

async function copyLink(failureAnnounce = "Failed to copy link"): Promise<boolean> {
  return copyTextToClipboard(
    buildShareUrl(),
    {
      pressIds: ["btn-copy", "btn-seed"],
      labelIds: ["btn-copy", "btn-seed"],
      successAnnounce: `Link copied for seed ${currentSeedLabel}`,
      failureAnnounce,
    },
    announce,
  );
}

async function copySeedOnly() {
  const seed = currentSeedLabel;
  await copyTextToClipboard(
    seed,
    {
      pressIds: ["btn-copy-seed"],
      labelIds: ["btn-copy-seed"],
      successAnnounce: `Seed ${seed} copied`,
      failureAnnounce: "Failed to copy seed",
    },
    announce,
  );
}

document.getElementById("btn-copy")?.addEventListener("click", () => {
  void copyLink();
});
document.getElementById("btn-seed")?.addEventListener("click", () => {
  void copyLink();
});

// Share sheet (#375): the button is rendered only where the browser can share
// an image file; everywhere else Copy link stays the path.
const shareBtn = document.getElementById("btn-share") as HTMLButtonElement | null;
let shareInFlight = false;

async function shareCurrentSnowflake() {
  if (shareInFlight) return;
  shareInFlight = true;
  if (shareBtn) {
    shareBtn.disabled = true;
    shareBtn.setAttribute("aria-busy", "true");
  }
  // Identity and link are fixed before rotation pauses: the link carries the
  // rotate flag, and it must match what Copy link would write.
  const habit = currentConditions.habit;
  const seed = currentSeedLabel;
  const url = buildShareUrl();
  const wasAutoRotating = scene.isAutoRotateEnabled;
  if (wasAutoRotating) scene.setAutoRotate(false);

  // Nothing below may await before navigator.share except toBlob, or the
  // tap's user activation is lost.
  try {
    visualPress("btn-share");
    scene.composer.render();
    const opaque = drawOnOpaqueCanvas(canvas, getComputedStyle(document.body).backgroundColor);
    const outcome = await shareSnowflake({
      canvas: opaque,
      fileName: formatExportFileName({ habit, seed }, "png"),
      title: `Frostbomb snowflake ${seed}`,
      text: `${habitLabel[habit]} · seed ${seed}`,
      url,
      nav: navigator,
      onError: (err) => {
        console.error("Failed to share snowflake", err);
        reportClientError("export", err);
      },
    });
    if (outcome === "shared") {
      announce(`Shared snowflake ${seed}`);
    } else if (outcome === "failed") {
      // share() consumed the activation, so this copy can fail too.
      await copyLink("Couldn't open the share sheet. Use Copy link.");
    }
  } catch (err) {
    console.error("Failed to share snowflake", err);
    reportClientError("export", err);
    await copyLink("Couldn't open the share sheet. Use Copy link.");
  } finally {
    shareInFlight = false;
    if (shareBtn) {
      shareBtn.disabled = false;
      shareBtn.removeAttribute("aria-busy");
    }
    if (wasAutoRotating) resumeAutoRotateFromPref();
  }
}

if (shareBtn && canShareFiles(navigator)) {
  shareBtn.hidden = false;
  shareBtn.addEventListener("click", () => {
    void shareCurrentSnowflake();
  });
}
document.getElementById("btn-copy-seed")?.addEventListener("click", copySeedOnly);

// What an export is named after. Read it at the moment each export captures its output.
function currentExportIdentity() {
  return { habit: currentConditions.habit, seed: currentSeedLabel };
}

async function saveSnowflake() {
  if (webglFallback || !(await waitForGpuScene())) return;
  await runExportAction(
    "btn-save",
    {
      start: "Saving snowflake as PNG",
      success: "Snowflake saved",
      failure: "Failed to save snowflake",
    },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      triggerFlash(motionQuery.matches);
      scene.composer.render();
      downloadHref(
        formatExportFileName(currentExportIdentity(), "png"),
        canvas.toDataURL("image/png"),
      );
    },
    scene,
    resumeAutoRotateFromPref,
  );
}

async function saveWallpaper() {
  if (webglFallback || !(await waitForGpuScene())) return;
  // Identity is fixed at click time; the capture below is one synchronous block.
  const identity = currentExportIdentity();
  await runExportAction(
    "btn-save-wallpaper",
    {
      start: "Saving wallpaper…",
      success: "Wallpaper saved",
      failure: "Failed to save wallpaper",
    },
    async () => {
      const size = wallpaperSize({
        screenW: window.screen.width,
        screenH: window.screen.height,
        dpr: window.devicePixelRatio,
        orientation: window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape",
        maxTexture: scene.renderer.capabilities.maxTextureSize,
      });
      // Resize, render, copy and restore all happen inside captureWallpaper
      // before anything awaits; encoding the 2D copy comes after the restore.
      const wallpaper = captureWallpaper(
        scene,
        size,
        getComputedStyle(document.body).backgroundColor,
      );
      const blob = await new Promise<Blob | null>((resolve) => wallpaper.toBlob(resolve, "image/png"));
      if (!blob) {
        throw new Error("Could not encode wallpaper PNG");
      }
      downloadHref(wallpaperFileName(identity), URL.createObjectURL(blob));
    },
    scene,
    resumeAutoRotateFromPref,
  );
}

async function saveSnowflakeSvg() {
  if (webglFallback) return;
  await runExportAction(
    "btn-save-svg",
    {
      start: "Saving snowflake as SVG",
      success: "Snowflake SVG saved",
      failure: "Failed to save snowflake SVG",
    },
    () => {
      if (!lastFlake) {
        throw new Error("No snowflake geometry to export");
      }

      const svg = buildSnowflakeSvg(lastFlake, currentExportIdentity());
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      downloadHref(
        formatExportFileName(currentExportIdentity(), "svg"),
        URL.createObjectURL(blob),
      );
    },
    scene,
    resumeAutoRotateFromPref,
  );
}

async function saveSnowflake3d() {
  if (webglFallback || !(await waitForGpuScene())) return;
  await runExportAction(
    "btn-save-3d",
    {
      start: "Saving snowflake as STL and GLB",
      success: "Snowflake 3D model saved",
      failure: "Failed to save snowflake 3D model",
    },
    async () => {
      if (!lastFlake) {
        throw new Error("No snowflake geometry to export");
      }

      const snapshot = {
        armCount: lastFlake.armCount,
        delays: lastFlake.delays.slice(),
        matrices: lastFlake.matrices.slice(),
        branchCount: lastFlake.branchCount,
        core: lastFlake.core,
      };
      // Same moment as the geometry copy. Regrow and Back stay available
      // while the module and the encoder run; the names must not follow them.
      const identity = currentExportIdentity();

      const files = await filesForExportIdentity(identity, snapshot, async () => {
        const { exportSnowflakeModels } = await import("./snowflake/mesh-export");
        return exportSnowflakeModels;
      });

      await downloadObjectUrls(
        files.map((file) => ({
          filename: file.filename,
          href: URL.createObjectURL(file.blob),
        })),
      );
    },
    scene,
    resumeAutoRotateFromPref,
  );
}

const exportButtons: Array<[buttonId: string, handler: () => void]> = [
  ["btn-save", () => void saveSnowflake()],
  ["btn-save-wallpaper", () => void saveWallpaper()],
  ["btn-save-svg", () => void saveSnowflakeSvg()],
  ["btn-save-3d", () => void saveSnowflake3d()],
];
for (const [buttonId, handler] of exportButtons) {
  document.getElementById(buttonId)?.addEventListener("click", handler);
}

const modeToggleButtons: Record<ShareModeKind, HTMLElement | null> = {
  pink: document.getElementById(MODE_TOGGLES.pink.buttonId),
  prism: document.getElementById(MODE_TOGGLES.prism.buttonId),
};

const sceneModes: Record<ShareModeKind, { set: (enabled: boolean) => void; isEnabled: () => boolean }> = {
  pink: { set: (enabled) => scene.setPinkMode(enabled), isEnabled: () => scene.isPinkModeEnabled },
  prism: { set: (enabled) => scene.setPrismMode(enabled), isEnabled: () => scene.isPrismModeEnabled },
};

function setShareMode(kind: ShareModeKind, enabled: boolean) {
  const spec = MODE_TOGGLES[kind];
  visualPress(spec.buttonId);
  syncModeToggleButton(modeToggleButtons[kind], spec, enabled);
  sceneModes[kind].set(enabled);
  document.body.classList.toggle(spec.bodyClass, enabled);
  syncModeParam(spec.param, enabled);
  announce(`${spec.label} mode ${enabled ? "enabled" : "disabled"}`);
}

function toggleShareMode(kind: ShareModeKind) {
  setShareMode(kind, !sceneModes[kind].isEnabled());
}

for (const kind of Object.keys(MODE_TOGGLES) as ShareModeKind[]) {
  modeToggleButtons[kind]?.addEventListener("click", () => toggleShareMode(kind));
}

// The user's rotate choice, not the live scene flag (which export/share
// pauses and reduced motion force off). Set by applyModes and toggleAutoRotate.
let rotatePref: boolean | undefined;

function writeCurrentModeParams(params: URLSearchParams) {
  setShareFlag(params, SHARE_PARAM_PINK, scene.isPinkModeEnabled);
  setShareFlag(params, SHARE_PARAM_PRISM, scene.isPrismModeEnabled);
  if (isLabMode) {
    setShareFlag(params, SHARE_PARAM_LAB, true);
  } else if (loadModePrefs().lab === false) {
    setShareFlag(params, SHARE_PARAM_LAB, false);
  }
  const rotate = effectiveRotateFlag(rotatePref, motionQuery.matches);
  if (rotate !== null) setShareFlag(params, SHARE_PARAM_ROTATE, rotate);
}

/** Last query string we wrote or accepted — hash-only popstate keeps this unchanged. */
let committedSearch = window.location.search;

function syncCommittedSearch(): void {
  committedSearch = window.location.search;
}

// Keeps the share URL an accurate snapshot of the current mode state,
// mirroring how seed changes already keep the URL in sync (see
// historyManager.onSelectSeed / labPanel.onSeedChange above). Always
// replaceState — crystal Back history is #316.
function syncModeParam(name: ShareFlagName, enabled: boolean) {
  urlWrites.flush();
  const url = new URL(window.location.href);
  setShareFlag(url.searchParams, name, enabled);
  window.history.replaceState(null, "", url.pathname + url.search);
  syncCommittedSearch();
  persistModePrefs();
}

function persistModePrefs(): void {
  writeModePrefs({
    pink: scene.isPinkModeEnabled,
    prism: scene.isPrismModeEnabled,
    lab: isLabMode,
    rotate: rotatePref,
  });
}

// Reads ?t=/?ss= (Lab temperature °C, supersaturation %) from the URL at
// boot. Out-of-range or unparsable values are ignored (safe defaults —
// falls through to the normal random sample), matching the seed/pink/prism
// convention of "absent or invalid = today's behavior".
function onScreenCrystalState(): CrystalUrlState {
  const lab =
    generationProvenance === "manual" && currentConditions
      ? quantizeLabConditions({
          temperatureC: currentConditions.temperatureC,
          supersaturation: currentConditions.supersaturation,
        })
      : null;
  return {
    seed: currentSeedLabel,
    provenance: lab ? "manual" : "sampled",
    lab,
    modes: {
      pink: scene.isPinkModeEnabled,
      prism: scene.isPrismModeEnabled,
      lab: isLabMode,
      // The rotate *preference*, not the live scene flag: export/share pause
      // the scene mid-flight and reduced motion forces it off, while share
      // URLs encode rotatePref (see writeCurrentModeParams). Comparing the
      // paused flag would see rotate as "changed" and regrow the crystal.
      rotate: effectiveRotateFlag(rotatePref, motionQuery.matches),
    },
  };
}

function readBootLabConditionsFromUrl(): { temperatureC: number; supersaturation: number } | null {
  return parseCrystalUrlState(window.location.search).lab;
}

// Boot: absent mode params fall back to localStorage; restore: absent means off.
function applyModes(source: ModeSource) {
  const params = new URLSearchParams(window.location.search);
  const stored = loadModePrefs();
  // Before setShareMode: it persists prefs and must see the intent.
  const rotateParam = readShareFlag(params, SHARE_PARAM_ROTATE);
  rotatePref = resolveRotatePref(
    rotateParam === null ? null : rotateParam === "1",
    stored.rotate,
    motionQuery.matches,
  );

  const target = resolveModes(source, params, stored);
  if (target.pink !== scene.isPinkModeEnabled) setShareMode("pink", target.pink);
  if (target.prism !== scene.isPrismModeEnabled) setShareMode("prism", target.prism);

  if (rotateParam !== null) {
    if (!motionQuery.matches) {
      const wantRotate = rotateParam === "1";
      if (wantRotate !== scene.isAutoRotateEnabled) {
        scene.setAutoRotate(wantRotate);
      }
    }
  } else if (
    !motionQuery.matches &&
    stored.rotate !== undefined &&
    stored.rotate !== scene.isAutoRotateEnabled
  ) {
    scene.setAutoRotate(stored.rotate);
  }
  updateRotateButtonUI();

  const labParam = readShareFlag(params, SHARE_PARAM_LAB);
  if (labParam !== null) {
    const wantLab = labParam === "1";
    if (wantLab !== isLabMode) {
      void toggleLabMode(false);
    }
  } else if (stored.lab) {
    void toggleLabMode(false);
  }
}

/** `push` for deliberate crystal changes; `replace` for incidental URL tweaks. */
function syncCrystalUrl(
  seedLabel: string,
  conditions: GrowthConditions,
  mode: "push" | "replace",
): void {
  // cancel, not flush: this write rebuilds from current state, so a pending incidental replace is subsumed.
  urlWrites.cancel();
  const url = new URL(window.location.href);
  url.searchParams.set(SHARE_PARAM_SEED, seedLabel);
  writeCurrentModeParams(url.searchParams);
  writeCrystalGeneration(url.searchParams, generationProvenance, conditions);
  const next = url.pathname + url.search;
  const current = window.location.pathname + window.location.search;
  try {
    // Re-growing the crystal already on screen would push a duplicate entry that
    // Back skips silently (popstate sees no change), so it replaces instead.
    if (mode === "push" && next !== current) {
      window.history.pushState(null, "", next);
    } else if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  } catch (err) {
    console.warn("History write failed", err);
    return;
  }
  syncCommittedSearch();
}

// Land the final drag/slider state when the pointer ends or the page goes away.
nakayaCanvas?.addEventListener("pointerup", () => urlWrites.flush());
nakayaCanvas?.addEventListener("pointercancel", () => urlWrites.flush());
window.addEventListener("pagehide", () => urlWrites.flush());

/**
 * Restores a popped history entry in place: same parse path as a cold load,
 * so Back lands exactly where the equivalent share link would.
 *
 * A popped entry that matches what is on screen is a no-op — no regrow, no
 * re-announce. Anything missing or foreign falls back to the normal defaults
 * path (a fresh crystal), never a blank canvas.
 */
function restoreCrystalState(state: CrystalUrlState): void {
  restoringHistory = true;
  try {
    applyModes("restore");

    if (state.seed) {
      currentSeed = { seed: hashString(state.seed), label: state.seed };
    } else {
      currentSeed = resolveSeed();
    }

    if (state.provenance === "manual" && state.lab) {
      const { conditions } = commitNakayaConditions({
        temperatureC: state.lab.temperatureC,
        supersaturation: state.lab.supersaturation,
        isGuideOpen,
        lastHabit,
        announce,
      });
      grow(conditions, true, false);
    } else {
      grow(undefined, true, false);
    }
  } finally {
    restoringHistory = false;
  }

  announce(`Loaded seed ${currentSeedLabel}: ${habitLabel[currentConditions.habit]}`);
}

window.addEventListener("popstate", () => {
  urlWrites.cancel();
  if (window.location.search === committedSearch) return;
  const popped = parseCrystalUrlState(window.location.search);
  const onScreen = onScreenCrystalState();
  if (crystalStatesEqual(popped, onScreen, { reducedMotion: motionQuery.matches })) {
    syncCommittedSearch();
    return;
  }
  restoreCrystalState(popped);
  syncCommittedSearch();
});

const btnRotate = document.getElementById("btn-rotate") as HTMLButtonElement | null;

function updateRotateButtonUI() {
  if (!btnRotate) return;
  if (webglFallback) {
    btnRotate.disabled = true;
    btnRotate.setAttribute("aria-pressed", "false");
    btnRotate.classList.remove("active");
    return;
  }
  const isReduced = motionQuery.matches;

  if (isReduced && scene.isAutoRotateEnabled) {
    scene.setAutoRotate(false);
  }

  const isEnabled = scene.isAutoRotateEnabled;
  btnRotate.setAttribute("aria-pressed", isEnabled.toString());
  btnRotate.classList.toggle("active", isEnabled);

  if (isReduced) {
    btnRotate.disabled = true;
    btnRotate.title = "Auto-rotation disabled (prefers-reduced-motion)";
    btnRotate.setAttribute("aria-label", "Auto-Rotate (disabled because prefers-reduced-motion is active)");
  } else {
    btnRotate.disabled = false;
    btnRotate.title = "Toggle auto-rotation (A)";
    btnRotate.removeAttribute("aria-label");
  }
}

function resumeAutoRotateFromPref(): void {
  scene.setAutoRotate(effectiveRotateFlag(rotatePref, motionQuery.matches) === true);
  updateRotateButtonUI();
}

updateRotateButtonUI();
motionQuery.addEventListener("change", updateRotateButtonUI);

function toggleAutoRotate() {
  if (motionQuery.matches || webglFallback) return;
  const enabled = !(rotatePref ?? scene.isAutoRotateEnabled);
  rotatePref = enabled;
  visualPress("btn-rotate");
  scene.setAutoRotate(enabled);
  updateRotateButtonUI();
  persistModePrefs();
  syncCrystalUrl(currentSeedLabel, currentConditions, "replace");
  announce(`Auto-rotation ${enabled ? "enabled" : "disabled"}`);
}

btnRotate?.addEventListener("click", toggleAutoRotate);

const photoMode = createPhotoMode({
  canvas,
  button: document.getElementById("btn-ui"),
  scene,
  announce,
  reducedMotion: () => motionQuery.matches,
});

document.getElementById("btn-ui")?.addEventListener("click", () => photoMode.toggle());

let canvasPointerDownX = 0;
let canvasPointerDownY = 0;

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  canvasPointerDownX = e.clientX;
  canvasPointerDownY = e.clientY;
});

canvas.addEventListener("click", (e: MouseEvent) => {
  if (photoMode.isHidden()) {
    const dx = e.clientX - canvasPointerDownX;
    const dy = e.clientY - canvasPointerDownY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 6) {
      photoMode.toggle(true);
    }
  }
});
canvas.addEventListener("dblclick", resetView);

function resetView() {
  if (!canUseGpuScene()) return;
  scene.resetView();
  visualPress("btn-reset");
  setTemporaryLabel("btn-reset", "Reset!", "⌂", false, true);
  announce("View reset to center");
}

document.getElementById("btn-reset")?.addEventListener("click", resetView);

// Initialize Global Keyboard Shortcuts
initKeyboardShortcuts({
  isGuideOpen: () => isGuideOpen,
  isLabMode: () => isLabMode,
  isUIHidden: () => photoMode.isHidden(),
  isDiagramFocused: () => document.activeElement === nakayaCanvas,
  onEscapeGuide: () => {
    toggleFieldGuide();
  },
  onEscapeLab: () => {
    toggleLabMode();
  },
  onEscapeUIHidden: () => {
    photoMode.toggle(true);
  },
  onRotateView: (dx, dy) => {
    scene.rotateView(dx, dy);
  },
  onRefresh: () => {
    handleRefresh();
  },
  onResetView: () => {
    resetView();
  },
  onToggleGuide: () => {
    toggleFieldGuide();
  },
  onNavigateShortcuts: () => {
    navigateToGuideSection("guide-shortcuts");
  },
  onToggleLab: () => {
    toggleLabMode();
  },
  onToggleUI: () => {
    photoMode.toggle();
  },
  onTogglePink: () => {
    toggleShareMode("pink");
  },
  onTogglePrism: () => {
    toggleShareMode("prism");
  },
  onSave: () => {
    saveSnowflake();
  },
  onSaveWallpaper: () => {
    void saveWallpaper();
  },
  onSaveSvg: () => {
    saveSnowflakeSvg();
  },
  onSave3d: () => {
    void saveSnowflake3d();
  },
  onToggleAutoRotate: () => {
    toggleAutoRotate();
  },
  onCopyLink: () => {
    void copyLink();
  },
  onCopySeed: () => {
    copySeedOnly();
  },
  onDailyCrystal: () => {
    handleDailyCrystal();
  },
});

async function runAppBoot(): Promise<void> {
  if (!nakayaDiagram) {
    nakayaDiagram = await initNakayaDiagram(nakayaCanvas);
  }
  const bootLabConditions = readBootLabConditionsFromUrl();
  await yieldToMain();
  if (!webglFallback) {
    await yieldToNextFrame();
    await mountGpuScene();
  }
  await yieldToMain();
  let boot: { conditions: GrowthConditions; label: string };
  if (bootLabConditions) {
    const { conditions } = commitNakayaConditions({
      temperatureC: bootLabConditions.temperatureC,
      supersaturation: bootLabConditions.supersaturation,
      isGuideOpen,
      lastHabit,
      announce,
    });
    boot = grow(conditions, true, true);
  } else {
    const seedInfo = resolveSeed();
    const flake = await buildSnowflakeAsync(seedInfo.seed);
    await yieldToMain();
    await yieldToNextFrame();
    boot = grow(undefined, false, true, undefined, seedInfo, flake, "skip");
  }
  await yieldToMain();
  applyModes("boot");
  nakayaDiagram?.update(boot.conditions.path);
  updateNakayaStatus(boot.conditions.temperatureC, boot.conditions.supersaturation, false);
  await yieldToMain();
  if (!webglFallback) {
    await finishGpuSceneBoot();
  }
  document.documentElement.setAttribute("data-boot", "ready");
}

scheduleDeferredSceneInit(() => {
  void runAppBoot();
});
markMainModuleFinished();
