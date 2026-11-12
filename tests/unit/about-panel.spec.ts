/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAboutPanel } from "../../src/ui/about-panel";

async function flushFrames(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

describe("createAboutPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button type="button" id="btn-about" aria-expanded="false">About</button>
      <dialog id="about-panel" aria-labelledby="about-panel-title">
        <h2 id="about-panel-title">About</h2>
        <form method="dialog">
          <button type="submit" id="about-close">Close</button>
        </form>
      </dialog>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("toggles open state from the About button and restores expanded on close", async () => {
    const panel = createAboutPanel();
    const btn = document.getElementById("btn-about") as HTMLButtonElement;

    btn.click();
    await flushFrames();
    expect(panel.isOpen()).toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");

    panel.close();
    await flushFrames();
    expect(panel.isOpen()).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });
});
