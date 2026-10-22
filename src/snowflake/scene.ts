import { yieldSceneBootSlice, yieldToMain } from "../lib/yield-to-main";

export type { Scene, SceneOptions } from "./scene-impl";

/** Loads the scene implementation chunk before perf marks (keeps mark window to construction only). */
export async function warmSceneModule(): Promise<void> {
  await yieldToMain();
  await import("./scene-impl");
  await yieldSceneBootSlice();
}

export async function createScene(
  canvas: HTMLCanvasElement,
  options: import("./scene-impl").SceneOptions = {},
): Promise<import("./scene-impl").Scene> {
  const { createSceneImpl } = await import("./scene-impl");
  return createSceneImpl(canvas, options);
}
