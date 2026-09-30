/** @vitest-environment happy-dom */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

describe("LabPanel.ensurePane retry behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="pane-mount"></div>';
  });

  it("retries loading tweakpane after a failed attempt instead of caching the rejection forever", async () => {
    let importAttempts = 0;

    vi.doMock("tweakpane", () => {
      importAttempts++;
      if (importAttempts === 1) {
        // Simulate a transient failure (e.g. a flaky network chunk load).
        throw new Error("simulated chunk load failure");
      }
      class FakePane {
        addBinding() {
          return { on: () => ({ on: () => {} }) };
        }
        addButton() {
          return { on: () => {} };
        }
      }
      return { Pane: FakePane };
    });

    const { LabPanel } = await import("../../src/ui/lab-panel.ts");

    const labPanel = new LabPanel({
      getCurrentSeedLabel: () => "abcde",
      onSeedChange: () => {},
      onRandomizeSeed: () => {},
      onConditionsChange: () => {},
    });

    await expect(labPanel.ensurePane()).rejects.toBeTruthy();
    expect(importAttempts).toBe(1);

    // A later click on the Lab Mode toggle should retry, not replay the same
    // cached rejected promise forever.
    await expect(labPanel.ensurePane()).resolves.toBeTruthy();
    expect(importAttempts).toBe(2);
  });
});

describe("Lab seed validation (#350)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.innerHTML = `
      <button id="btn-seed" class="seed-btn" title="Copy share link (C)" aria-label="Copy share link for current seed">
        <span class="seed-btn__prefix">Vol.</span>
        <span id="seed-display">frost1</span>
        <span class="seed-btn__icon" aria-hidden="true">⎘</span>
      </button>
      <div id="pane-mount"></div>
      <div class="tp-lblv">Seed<input id="pane-seed" value="frost1" /></div>
      <div id="a11y-announcer"></div>
    `;
  });

  async function loadPanel() {
    let seedChange: ((ev: { value: string }) => void) | null = null;
    let refreshCount = 0;

    vi.doMock("tweakpane", () => ({
      Pane: class {
        addBinding(_params: unknown, key: string) {
          return {
            on: (event: string, cb: (ev: { value: string }) => void) => {
              if (key === "seed" && event === "change") seedChange = cb;
              return this;
            },
          };
        }
        addButton() {
          return { on: () => this };
        }
        refresh() {
          refreshCount += 1;
        }
      },
    }));

    const feedback = await import("../../src/ui/feedback");
    const labelSpy = vi.spyOn(feedback, "setTemporaryLabel");
    const announcer = await import("../../src/ui/announcer");
    const announceSpy = vi.spyOn(announcer, "announce");
    const { LabPanel } = await import("../../src/ui/lab-panel.ts");
    const onSeedChange = vi.fn();
    const labPanel = new LabPanel({
      getCurrentSeedLabel: () => "frost1",
      onSeedChange,
      onRandomizeSeed: () => {},
      onConditionsChange: () => {},
    });
    await labPanel.ensurePane();
    if (!seedChange) throw new Error("seed change handler was not registered");
    return { labPanel, seedChange, onSeedChange, labelSpy, announceSpy, refreshCount: () => refreshCount };
  }

  function expectCopyButtonUntouched() {
    const btn = document.getElementById("btn-seed") as HTMLButtonElement;
    expect(btn.className).toBe("seed-btn");
    expect(btn.getAttribute("aria-label")).toBe("Copy share link for current seed");
    expect(btn.getAttribute("title")).toBe("Copy share link (C)");
    expect(document.getElementById("seed-display")?.textContent).toBe("frost1");
    expect(document.querySelector(".seed-btn__icon")?.textContent).toBe("⎘");
  }

  it("rejects an invalid seed without relabeling the copy-link button", async () => {
    const { labPanel, seedChange, onSeedChange, labelSpy, announceSpy, refreshCount } = await loadPanel();

    seedChange({ value: "no!" });

    expect(onSeedChange).not.toHaveBeenCalled();
    expect(labelSpy).not.toHaveBeenCalled();
    expect(announceSpy).toHaveBeenCalledWith(
      "Invalid seed. Seeds must be 3 to 12 alphanumeric characters.",
    );
    expect(labPanel.params.seed).toBe("frost1");
    expect(refreshCount()).toBe(1);
    const paneInput = document.getElementById("pane-seed") as HTMLInputElement;
    expect(paneInput.style.outline).toMatch(/2px/);
    expect(paneInput.style.outline).toMatch(/solid/);
    expect(paneInput.style.outline).toMatch(/ff6b6b/i);
    expectCopyButtonUntouched();
  });

  it("grows a valid seed and does not announce an error", async () => {
    const { labPanel, seedChange, onSeedChange, labelSpy, announceSpy, refreshCount } = await loadPanel();

    seedChange({ value: " Crystal " });

    expect(onSeedChange).toHaveBeenCalledExactlyOnceWith("crystal");
    expect(labelSpy).not.toHaveBeenCalled();
    expect(announceSpy).not.toHaveBeenCalled();
    expect(refreshCount()).toBe(0);
    expect(labPanel.params.seed).toBe("····");
    expect((document.getElementById("pane-seed") as HTMLInputElement).style.outline).toBe("");
    expectCopyButtonUntouched();
  });

  it("leaves clipboard Copied and Failed labels on the copy buttons only", () => {
    const panel = readFileSync("src/ui/lab-panel.ts", "utf8");
    const main = readFileSync("src/main.ts", "utf8");
    expect(panel).not.toContain("setTemporaryLabel");
    expect(main).toContain('labelIds: ["btn-copy", "btn-seed"]');
    expect(main).toContain('setTemporaryLabel(id, "Copied!", "✓", false, true)');
    expect(main).toContain('setTemporaryLabel(id, "Failed", "✕", true)');
    expect(main).not.toContain('setTemporaryLabel("btn-seed", "3-12 chars"');
  });
});

