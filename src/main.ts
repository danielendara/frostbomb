import "./style.css";
import { createScene } from "./snowflake/scene";
import { buildSnowflake, type BuildResult } from "./snowflake/geometry";
import { buildSnowflakeSvg } from "./snowflake/svg-export";
import { sampleConditions, habitLabel, getHabit, GrowthConditions } from "./snowflake/nakaya";
import { mulberry32, resolveSeed, hashString, Rand } from "./snowflake/random";
import { initNakayaDiagram } from "./snowflake/diagram";
import { announce } from "./ui/announcer";
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

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const scene = createScene(canvas);

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
    const url = new URL(window.location.href);
    url.searchParams.set("seed", seedVal);
    window.history.replaceState(null, "", url.pathname + url.search);
    const { conditions } = grow(undefined, true, true);
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
    const url = new URL(window.location.href);
    url.searchParams.set("seed", val);
    window.history.replaceState(null, "", url.pathname + url.search);

    grow(currentConditions, true, false);
    announce(`Seed changed to ${val}`);
  },
  onRandomizeSeed: () => {
    const result = grow(currentConditions, false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("seed", result.label);
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

function updateNakayaStatus(temp: number, ss: number, isPreview: boolean) {
  const statusEl = document.getElementById("nakaya-status");
  if (!statusEl) return;
  const habit = getHabit(temp, ss);
  const habitText = habitLabel[habit];
  const humPct = Math.round(ss * 100);
  const tempStr = temp.toFixed(1);
  if (isPreview) {
    statusEl.setAttribute("aria-live", "off");
    statusEl.innerHTML = `Preview: <span style="color: var(--accent);">${tempStr}°C</span>, <span style="color: var(--accent);">${humPct}%</span> • <em>${habitText}</em>`;
  } else {
    statusEl.setAttribute("aria-live", "polite");
    statusEl.innerHTML = `Active: <span style="color: var(--accent-hot);">${tempStr}°C</span>, <span style="color: var(--accent-hot);">${humPct}%</span> • <strong>${habitText}</strong>`;
  }
}

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
  const t = labPanel.params.temperature;
  const ss = labPanel.params.supersaturation / 100;
  const habit = getHabit(t, ss);
  const habitText = habitLabel[habit];

  if (nakayaCanvas) {
    const nakayaAria = `Nakaya morphology diagram: ${t.toFixed(1)}°C, ${labPanel.params.supersaturation.toFixed(0)}% humidity. Resulting habit: ${habitText}. Use arrow keys to adjust.`;
    if (lastNakayaAria !== nakayaAria) {
      nakayaCanvas.setAttribute("aria-label", nakayaAria);
      lastNakayaAria = nakayaAria;
    }
  }

  // Field Guide's #nakaya-status is the live region for committed conditions.
  // Lab sliders still announce habit changes when that region is hidden.
  if (!isGuideOpen && lastHabit && lastHabit !== habitText) {
    announce(`Habit changed to: ${habitText}`);
  }

  const conditions: GrowthConditions = {
    temperatureC: t,
    supersaturation: ss,
    habit: habit,
    path: [{ temp: t, ss: ss }],
  };
  labPanel.params.habit = habitText;
  labPanel.refresh();

  grow(conditions, true, false);
}

async function copyLink() {
  const url = `${window.location.origin}${window.location.pathname}?seed=${currentSeedLabel}`;
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
  setTemporaryLabel("btn-save", "Saving...", "⌛");
  visualPress("btn-save");
  announce("Saving snowflake as PNG");

  setTimeout(() => {
    try {
      triggerFlash(motionQuery.matches);
      scene.composer.render();

      const dataUrl = canvas.toDataURL("image/png");
      downloadHref(exportFileName("png"), dataUrl);

      setTemporaryLabel("btn-save", "Saved!", "✓", false, true);
      announce("Snowflake saved");
    } catch (err) {
      console.error("Failed to save snowflake:", err);
      setTemporaryLabel("btn-save", "Failed", "✕", true);
      announce("Failed to save snowflake");
    }
  }, 100);
}

document.getElementById("btn-save")?.addEventListener("click", saveSnowflake);

function exportFileName(extension: string): string {
  const habit = currentConditions.habit.replace(/_/g, "-");
  return `frostbomb-${habit}-${currentSeedLabel}.${extension}`;
}

function saveSnowflakeSvg() {
  setTemporaryLabel("btn-save-svg", "Saving...", "⌛");
  visualPress("btn-save-svg");
  announce("Saving snowflake as SVG");

  try {
    if (!lastFlake) {
      throw new Error("No snowflake geometry to export");
    }

    const svg = buildSnowflakeSvg(lastFlake, {
      habit: currentConditions.habit,
      seed: currentSeedLabel,
    });
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    downloadHref(exportFileName("svg"), URL.createObjectURL(blob));

    setTemporaryLabel("btn-save-svg", "Saved!", "✓", false, true);
    announce("Snowflake SVG saved");
  } catch (err) {
    console.error("Failed to save snowflake SVG:", err);
    setTemporaryLabel("btn-save-svg", "Failed", "✕", true);
    announce("Failed to save snowflake SVG");
  }
}

document.getElementById("btn-save-svg")?.addEventListener("click", saveSnowflakeSvg);

async function saveSnowflake3d() {
  setTemporaryLabel("btn-save-3d", "Saving...", "⌛");
  visualPress("btn-save-3d");
  announce("Saving snowflake as STL and GLB");

  try {
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

    setTemporaryLabel("btn-save-3d", "Saved!", "✓", false, true);
    announce("Snowflake 3D model saved");
  } catch (err) {
    console.error("Failed to save snowflake 3D model:", err);
    setTemporaryLabel("btn-save-3d", "Failed", "✕", true);
    announce("Failed to save snowflake 3D model");
  }
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
  announce(`Prism mode ${enabled ? "enabled" : "disabled"}`);
}

btnPrism?.addEventListener("click", togglePrismMode);

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
  announce(`Auto-rotation ${enabled ? "enabled" : "disabled"}`);
}

btnRotate?.addEventListener("click", toggleAutoRotate);

const btnUI = document.getElementById("btn-ui");

function toggleUI(forceShow?: boolean) {
  isUIHidden = forceShow === undefined ? !isUIHidden : !forceShow;
  visualPress("btn-ui");

  const uiElements = document.querySelectorAll(".masthead, .field-notes, .footer, .lab-controls");
  uiElements.forEach((el) => el.classList.toggle("ui-hidden", isUIHidden));

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
  } else {
    announce("UI visible");
    setTimeout(() => btnUI?.focus(), 50);
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

grow();
scene.start();
