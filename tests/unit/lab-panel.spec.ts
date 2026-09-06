/** @vitest-environment happy-dom */
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
