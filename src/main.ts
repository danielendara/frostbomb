import "./style.css";
import { createScene } from "./snowflake/scene";
import {
  WEBGL_CONTEXT_LOST_ANNOUNCEMENT,
  showReloadCrystalAffordance,
} from "./snowflake/context-loss";
import { buildSnowflake, type BuildResult } from "./snowflake/geometry";
import { buildSnowflakeSvg } from "./snowflake/svg-export";
import { sampleConditions, habitLabel, GrowthConditions } from "./snowflake/nakaya";
import { mulberry32, resolveSeed, hashString, Rand } from "./snowflake/random";
import { initNakayaDiagram } from "./snowflake/diagram";
import { announce } from "./ui/announcer";
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
import { downloadHref, downloadObjectUrls } from "./ui/download";
import { runExportAction } from "./ui/export-action";
import { MARK_FIRST_FLAKE_BUILT, markOnce } from "./snowflake/perf-marks";
import { loadModePrefs, saveModePrefs as writeModePrefs } from "./mode-prefs";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const scene = createScene(canvas, {
  onContextLost: () => {
    announce(WEBGL_CONTEXT_LOST_ANNOUNCEMENT);
    showReloadCrystalAffordance();
  },
});

document.getElementById("btn-reload-crystal")?.addEventListener("click", () => {
  window.location.reload();
});

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const nakayaCanvas = document.getElementById("nakaya-diagram") as HTMLCanvasElement;
const nakayaDiagram = initNakayaDiagram(nakayaCanvas);

// Change detection cache for DOM attributes
let lastNakayaAria = "";
let lastCanvasAria = "";
let lastSeedAria = "";
let lastTitle = "";

let isLabMode = false;
let isGuideOpen = false;
let isUIHidden = false;
let guideReturnTarget: HTMLElement | null = null;
let currentConditions: GrowthConditions;
let lastHabit: string | null = null;
let currentSeedLabel: string;
let currentSeed: { seed: number; label: string } | null = null;
let lastFlake: BuildResult | null = null;
let labToggleGeneration = 0;

// History Manager
const historyManager = new SeedHistoryManager({
  onSelectSeed: (seedVal) => {
    if (seedVal === currentSeedLabel) {
      announce(`Seed ${seedVal} is already active`);
      return;
    }
    currentSeed = {
      seed: hashString(seedVal),
      label: seedVal,
    };
    const { conditions } = grow(undefined, true, true);
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seedVal);
    setLabConditionsParams(url.searchParams, conditions);
    window.history.replaceState(null, "", url.pathname + url.search);
    announce(`Loaded seed ${seedVal}: ${habitLabel[conditions.habit]}`);
  },
});

// Lab Panel
const labPanel = new LabPanel({
  getCurrentSeedLabel: () => currentSeedLabel,
  onSeedChange: (val) => {
    currentSeed = {
      seed: hashString(val),
      label: val,
    };
    const { conditions } = grow(currentConditions, true, false);
    const url = new URL(window.location.href);
    url.searchParams.set("seed", val);
    setLabConditionsParams(url.searchParams, conditions);
    window.history.replaceState(null, "", url.pathname + url.search);

    announce(`Seed changed to ${val}`);
  },
  onRandomizeSeed: () => {
    const result = grow(currentConditions, false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("seed", result.label);
    setLabConditionsParams(url.searchParams, result.conditions);
    window.history.replaceState(null, "", url.pathname + url.search);
    announce(`Randomized seed to ${result.label}`);
  },
  onConditionsChange: () => {
    updateFromPane();
  },
});

function updateRecentSeedsUI() {
  historyManager.updateUI(currentSeedLabel, isLabMode, isGuideOpen);
}

// Wire clear history button delegation
document.getElementById("btn-clear-history")?.addEventListener("click", () => {
  historyManager.clear(currentSeedLabel, isLabMode, isGuideOpen);
});

function grow(
  manualConditions?: GrowthConditions,
  keepSeed = false,
  animate = true,
  previewPoint?: { temp: number; ss: number }
) {
  const isNewSeed = !keepSeed || !currentSeed;
  if (isNewSeed) {
    currentSeed = resolveSeed();
  }

  const { seed, label } = currentSeed!;
  currentSeedLabel = label;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);

  const conditions = manualConditions || sampleConditions(rand);
  currentConditions = conditions;
  const result = buildSnowflake(conditions, rand);
  lastFlake = result;
  markOnce(MARK_FIRST_FLAKE_BUILT);

  scene.updateFlake(result, animate);
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

  const title = `${habitLabel[conditions.habit]} — frostbomb`;
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
  const refreshIcon = document.querySelector(".refresh__icon");
  if (refreshIcon) {
    refreshIcon.classList.remove("animate-spin-once");
    void (refreshIcon as HTMLElement).offsetWidth;
    refreshIcon.classList.add("animate-spin-once");
  }
  window.history.replaceState(null, "", window.location.pathname);
  const { conditions, label } = grow(isLabMode ? currentConditions : undefined);
  announce(`New snowflake grown: ${habitLabel[conditions.habit]} (Seed: ${label})`);
}

document.getElementById("refresh")?.addEventListener("click", handleRefresh);
document.querySelector(".wordmark-link")?.addEventListener("click", handleRefresh);

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
    } catch (err) {
      console.error("Failed to load Lab Mode:", err);
      if (labStatus) {
        labStatus.textContent = "ERROR";
        labStatus.classList.add("btn--error");
      }
      isLabMode = false;
      if (labToggle) {
        labToggle.setAttribute("aria-pressed", "false");
        labToggle.setAttribute("aria-expanded", "false");
      }
      announce("Failed to load Lab Mode controls");
      persistModePrefs();
      return;
    } finally {
      if (labToggle instanceof HTMLButtonElement) labToggle.disabled = false;
    }
    if (!isLabMode || toggleGeneration !== labToggleGeneration) return;
    if (labStatus) {
      labStatus.textContent = "ON";
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
      el.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

  const t = x * 40 - 40;
  const ss = 1 - y;

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
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    const t = x * 40 - 40;
    const ss = 1 - y;
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
  const isNav = [
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
  ].includes(key);
  const isAction = key === " " || key === "Enter";

  if (isNav || isAction) {
    e.preventDefault();
    e.stopPropagation();

    if (!isLabMode) {
      toggleLabMode(false);
    }

    if (isNav) {
      const ke = e as KeyboardEvent;
      const multiplier = ke.shiftKey ? 3 : 1;
      const tStep = 1 * multiplier;
      const ssStep = 5 * multiplier;
      let changed = false;

      if (key === "ArrowLeft") {
        labPanel.params.temperature = Math.max(-40, labPanel.params.temperature - tStep);
        changed = true;
      }
      if (key === "ArrowRight") {
        labPanel.params.temperature = Math.min(0, labPanel.params.temperature + tStep);
        changed = true;
      }
      if (key === "ArrowUp") {
        labPanel.params.supersaturation = Math.min(100, labPanel.params.supersaturation + ssStep);
        changed = true;
      }
      if (key === "ArrowDown") {
        labPanel.params.supersaturation = Math.max(0, labPanel.params.supersaturation - ssStep);
        changed = true;
      }

      if (key === "Home") {
        labPanel.params.temperature = -40;
        changed = true;
      }
      if (key === "End") {
        labPanel.params.temperature = 0;
        changed = true;
      }
      if (key === "PageUp") {
        labPanel.params.supersaturation = Math.min(100, labPanel.params.supersaturation + 25);
        changed = true;
      }
      if (key === "PageDown") {
        labPanel.params.supersaturation = Math.max(0, labPanel.params.supersaturation - 25);
        changed = true;
      }

      if (changed) {
        visualPress("nakaya-diagram");
        updateFromPane();
      }
    }
  }
});

function updateFromPane() {
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

  const url = new URL(window.location.href);
  setLabConditionsParams(url.searchParams, conditions);
  window.history.replaceState(null, "", url.pathname + url.search);
}

// Shared by buildShareUrl and every place that keeps the URL honest after a
// seed/conditions change (onSelectSeed, onSeedChange, onRandomizeSeed,
// updateFromPane) — one formula for the `t`/`ss` params, not five.
function setLabConditionsParams(params: URLSearchParams, conditions: GrowthConditions) {
  params.set("t", conditions.temperatureC.toFixed(1));
  params.set("ss", Math.round(conditions.supersaturation * 100).toString());
}

function buildShareUrl(): string {
  const params = new URLSearchParams();
  params.set("seed", currentSeedLabel);
  if (scene.isPinkModeEnabled) params.set("pink", "1");
  if (scene.isPrismModeEnabled) params.set("prism", "1");
  if (scene.isAutoRotateEnabled) {
    params.set("rotate", "1");
  } else if (loadModePrefs().rotate === false) {
    params.set("rotate", "0");
  }
  if (isLabMode) {
    params.set("lab", "1");
  } else if (loadModePrefs().lab === false) {
    params.set("lab", "0");
  }
  setLabConditionsParams(params, currentConditions);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

async function copyLink() {
  const url = buildShareUrl();
  visualPress("btn-copy");
  visualPress("btn-seed");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
    } else {
      throw new Error("Clipboard API unavailable");
    }
    setTemporaryLabel("btn-copy", "Copied!", "✓", false, true);
    setTemporaryLabel("btn-seed", "Copied!", "✓", false, true);
    announce(`Link copied for seed ${currentSeedLabel}`);
  } catch (err) {
    console.warn("Clipboard API failed, trying legacy fallback:", err);
    try {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (!successful) {
        throw new Error("execCommand copy failed");
      }
      setTemporaryLabel("btn-copy", "Copied!", "✓", false, true);
      setTemporaryLabel("btn-seed", "Copied!", "✓", false, true);
      announce(`Link copied for seed ${currentSeedLabel}`);
    } catch (fallbackErr) {
      console.error("Legacy fallback failed:", fallbackErr);
      setTemporaryLabel("btn-copy", "Failed", "✕", true);
      setTemporaryLabel("btn-seed", "Failed", "✕", true);
      announce("Failed to copy link");
    }
  }
}

async function copySeedOnly() {
  const seed = currentSeedLabel;
  visualPress("btn-copy-seed");

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(seed);
    } else {
      throw new Error("Clipboard API unavailable");
    }
    setTemporaryLabel("btn-copy-seed", "Copied!", "✓", false, true);
    announce(`Seed ${seed} copied`);
  } catch (err) {
    console.warn("Clipboard API failed, trying legacy fallback:", err);
    try {
      const textArea = document.createElement("textarea");
      textArea.value = seed;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (!successful) {
        throw new Error("execCommand copy failed");
      }
      setTemporaryLabel("btn-copy-seed", "Copied!", "✓", false, true);
      announce(`Seed ${seed} copied`);
    } catch (fallbackErr) {
      console.error("Legacy fallback failed:", fallbackErr);
      setTemporaryLabel("btn-copy-seed", "Failed", "✕", true);
      announce("Failed to copy seed");
    }
  }
}

document.getElementById("btn-copy")?.addEventListener("click", copyLink);
document.getElementById("btn-seed")?.addEventListener("click", copyLink);
document.getElementById("btn-copy-seed")?.addEventListener("click", copySeedOnly);

async function saveSnowflake() {
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
      downloadHref(exportFileName("png"), canvas.toDataURL("image/png"));
    },
    scene,
  );
}

document.getElementById("btn-save")?.addEventListener("click", () => {
  void saveSnowflake();
});

function exportFileName(extension: string): string {
  const habit = currentConditions.habit.replace(/_/g, "-");
  return `frostbomb-${habit}-${currentSeedLabel}.${extension}`;
}

async function saveSnowflakeSvg() {
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

      const svg = buildSnowflakeSvg(lastFlake, {
        habit: currentConditions.habit,
        seed: currentSeedLabel,
      });
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      downloadHref(exportFileName("svg"), URL.createObjectURL(blob));
    },
    scene,
  );
}

document.getElementById("btn-save-svg")?.addEventListener("click", () => {
  void saveSnowflakeSvg();
});

async function saveSnowflake3d() {
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

      const { exportSnowflakeModels } = await import("./snowflake/mesh-export");
      const { stl, glb } = await exportSnowflakeModels(snapshot);

      await downloadObjectUrls([
        { filename: exportFileName("stl"), href: URL.createObjectURL(stl) },
        { filename: exportFileName("glb"), href: URL.createObjectURL(glb) },
      ]);
    },
    scene,
  );
}

document.getElementById("btn-save-3d")?.addEventListener("click", () => {
  void saveSnowflake3d();
});

const btnPink = document.getElementById("btn-pink");

function togglePinkMode() {
  const enabled = !scene.isPinkModeEnabled;
  visualPress("btn-pink");
  if (btnPink) {
    btnPink.setAttribute("aria-pressed", enabled.toString());
    btnPink.classList.toggle("active", enabled);
    btnPink.setAttribute("aria-label", "Pink Mode (P)");
    btnPink.title = `Toggle pink mode (P) - current: ${enabled ? "active" : "inactive"}`;
  }
  scene.setPinkMode(enabled);
  document.body.classList.toggle("pink-mode", enabled);
  syncModeParam("pink", enabled);
  announce(`Pink mode ${enabled ? "enabled" : "disabled"}`);
}

btnPink?.addEventListener("click", togglePinkMode);

const btnPrism = document.getElementById("btn-prism");

function togglePrismMode() {
  const enabled = !scene.isPrismModeEnabled;
  visualPress("btn-prism");
  if (btnPrism) {
    btnPrism.setAttribute("aria-pressed", enabled.toString());
    btnPrism.classList.toggle("active", enabled);
    btnPrism.setAttribute("aria-label", "Prism Mode (M)");
    btnPrism.title = `Toggle prism mode (M) - current: ${enabled ? "active" : "inactive"}`;
  }
  scene.setPrismMode(enabled);
  document.body.classList.toggle("prism-mode", enabled);
  syncModeParam("prism", enabled);
  announce(`Prism mode ${enabled ? "enabled" : "disabled"}`);
}

btnPrism?.addEventListener("click", togglePrismMode);

// Keeps the share URL an accurate snapshot of the current pink/prism state,
// mirroring how seed changes already keep the URL in sync (see
// historyManager.onSelectSeed / labPanel.onSeedChange above). Unknown/absent
// flags mean "off", so we omit the param entirely rather than writing `=0`.
function syncModeParam(name: "pink" | "prism", enabled: boolean) {
  const url = new URL(window.location.href);
  if (enabled) {
    url.searchParams.set(name, "1");
  } else {
    url.searchParams.delete(name);
  }
  window.history.replaceState(null, "", url.pathname + url.search);
  persistModePrefs();
}

function persistModePrefs(): void {
  writeModePrefs({
    pink: scene.isPinkModeEnabled,
    prism: scene.isPrismModeEnabled,
    lab: isLabMode,
    rotate: scene.isAutoRotateEnabled,
  });
}

// Reads ?t=/?ss= (Lab temperature °C, supersaturation %) from the URL at
// boot. Out-of-range or unparsable values are ignored (safe defaults —
// falls through to the normal random sample), matching the seed/pink/prism
// convention of "absent or invalid = today's behavior".
function readBootLabConditionsFromUrl(): { temperatureC: number; supersaturation: number } | null {
  const params = new URLSearchParams(window.location.search);
  const tRaw = params.get("t");
  const ssRaw = params.get("ss");
  if (tRaw === null || ssRaw === null) return null;

  const temperatureC = Number(tRaw);
  const ssPercent = Number(ssRaw);
  if (!Number.isFinite(temperatureC) || !Number.isFinite(ssPercent)) return null;
  if (temperatureC < -40 || temperatureC > 0) return null;
  if (ssPercent < 0 || ssPercent > 100) return null;

  return { temperatureC, supersaturation: ssPercent / 100 };
}

// Applies ?pink=1 / ?prism=1 / ?rotate=1|0 / ?lab=1|0 from the URL at boot, using the
// same toggle functions (and thus the same visual/announce/URL-sync path) as
// clicking the buttons. Called right after the first grow(), matching the
// timing of the existing ?seed= bootstrap (resolveSeed() runs inside that
// same grow()).
//
// The URL wins whenever a param is present (including an explicit `=0`-ish
// absence of `=1`, which still means "off" per the existing convention) —
// only a genuinely absent param falls back to the last-remembered
// localStorage prefs, so a plain revisit with no query string restores
// last visit's look instead of always booting both modes off.
function applyBootModesFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const stored = loadModePrefs();

  const pinkParam = params.get("pink");
  if (pinkParam !== null ? pinkParam === "1" : stored.pink) {
    togglePinkMode();
  }
  const prismParam = params.get("prism");
  if (prismParam !== null ? prismParam === "1" : stored.prism) {
    togglePrismMode();
  }

  const rotateParam = params.get("rotate");
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

  const labParam = params.get("lab");
  if (labParam !== null) {
    const wantLab = labParam === "1";
    if (wantLab !== isLabMode) {
      void toggleLabMode(false);
    }
  } else if (stored.lab) {
    void toggleLabMode(false);
  }
}

const btnRotate = document.getElementById("btn-rotate") as HTMLButtonElement | null;

function updateRotateButtonUI() {
  if (!btnRotate) return;
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

updateRotateButtonUI();
motionQuery.addEventListener("change", updateRotateButtonUI);

function toggleAutoRotate() {
  if (motionQuery.matches) return;
  const enabled = !scene.isAutoRotateEnabled;
  visualPress("btn-rotate");
  scene.setAutoRotate(enabled);
  updateRotateButtonUI();
  persistModePrefs();
  announce(`Auto-rotation ${enabled ? "enabled" : "disabled"}`);
}

btnRotate?.addEventListener("click", toggleAutoRotate);

const btnUI = document.getElementById("btn-ui");
const PHOTO_MODE_UI_SELECTOR = ".masthead, .field-notes, .footer, .lab-controls";

function getPhotoModeUIElements(): NodeListOf<Element> {
  return document.querySelectorAll(PHOTO_MODE_UI_SELECTOR);
}

function isFocusInPhotoModeUI(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return Array.from(getPhotoModeUIElements()).some((root) => root.contains(el));
}

function setPhotoModeUIInert(inert: boolean): void {
  getPhotoModeUIElements().forEach((el) => {
    if (inert) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  });
}

function focusSceneForPhotoMode(): void {
  if (!canvas.hasAttribute("tabindex")) {
    canvas.setAttribute("tabindex", "-1");
  }
  canvas.focus({ preventScroll: true });
}

function restorePhotoModeUIFocus(): void {
  const focusBtn = () => {
    if (btnUI instanceof HTMLElement) {
      btnUI.focus({ preventScroll: true });
    }
  };

  // Visibility is animated, so retry after layout and once it has completed.
  // The latter also covers browsers that do not dispatch transitionend here.
  requestAnimationFrame(() => requestAnimationFrame(focusBtn));
  setTimeout(focusBtn, 350);
  setTimeout(focusBtn, 700);
}

document.addEventListener("focusin", (e) => {
  if (!isUIHidden) return;
  const target = e.target;
  if (target instanceof HTMLElement && target.closest(".ui-hidden")) {
    focusSceneForPhotoMode();
  }
});

function toggleUI(forceShow?: boolean) {
  isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;
  visualPress("btn-ui");

  getPhotoModeUIElements().forEach((el) => el.classList.toggle("ui-hidden", isUIHidden));
  setPhotoModeUIInert(isUIHidden);

  if (btnUI) {
    btnUI.setAttribute("aria-pressed", isUIHidden.toString());
    btnUI.classList.toggle("active", isUIHidden);
  }

  scene.setPhotoMode(isUIHidden);

  if (isUIHidden) {
    announce(
      motionQuery.matches
        ? "Photo Mode. Press H or Esc to show UI."
        : "Photo Mode. Depth of field on. Press H or Esc to show UI.",
    );
    if (isFocusInPhotoModeUI(document.activeElement)) {
      focusSceneForPhotoMode();
    }
  } else {
    canvas.removeAttribute("tabindex");
    announce("Photo Mode exited. UI restored.");
    restorePhotoModeUIFocus();
  }
}

btnUI?.addEventListener("click", () => toggleUI());

let canvasPointerDownX = 0;
let canvasPointerDownY = 0;

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  canvasPointerDownX = e.clientX;
  canvasPointerDownY = e.clientY;
});

canvas.addEventListener("click", (e: MouseEvent) => {
  if (isUIHidden) {
    const dx = e.clientX - canvasPointerDownX;
    const dy = e.clientY - canvasPointerDownY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 6) {
      toggleUI(true);
    }
  }
});
canvas.addEventListener("dblclick", resetView);

function resetView() {
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
  isUIHidden: () => isUIHidden,
  isDiagramFocused: () => document.activeElement === nakayaCanvas,
  onEscapeGuide: () => {
    toggleFieldGuide();
  },
  onEscapeLab: () => {
    toggleLabMode();
  },
  onEscapeUIHidden: () => {
    toggleUI(true);
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
    toggleUI();
  },
  onTogglePink: () => {
    togglePinkMode();
  },
  onTogglePrism: () => {
    togglePrismMode();
  },
  onSave: () => {
    saveSnowflake();
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
    copyLink();
  },
  onCopySeed: () => {
    copySeedOnly();
  },
});

const bootLabConditions = readBootLabConditionsFromUrl();
if (bootLabConditions) {
  // Same path manual Lab edits use (commitNakayaConditions derives habit +
  // path from the fixed point) so the shared flake's habit matches exactly,
  // rather than sampleConditions()'s random roll.
  const { conditions } = commitNakayaConditions({
    temperatureC: bootLabConditions.temperatureC,
    supersaturation: bootLabConditions.supersaturation,
    isGuideOpen,
    lastHabit,
    announce,
  });
  grow(conditions, true, true);
} else {
  grow();
}
applyBootModesFromUrl();
scene.start();
