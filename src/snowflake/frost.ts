import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
} from "three";
import { FROST_REPEAT, FROST_SIZE, generateFrostBuffers, type FrostBuffers } from "./frost-data";
import { reportClientError } from "../ui/client-error";

function configureMap(texture: DataTexture): DataTexture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  // Square grain on the faceted plate segments (see FROST_REPEAT).
  texture.repeat.set(FROST_REPEAT[0], FROST_REPEAT[1]);
  texture.anisotropy = 8;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface FrostMaps {
  roughnessMap: DataTexture;
  normalMap: DataTexture;
}

function buffersToTextures(buffers: FrostBuffers): FrostMaps {
  const roughnessMap = configureMap(
    new DataTexture(buffers.roughnessData, FROST_SIZE, FROST_SIZE, RGBAFormat),
  );
  const normalMap = configureMap(
    new DataTexture(buffers.normalData, FROST_SIZE, FROST_SIZE, RGBAFormat),
  );
  return { roughnessMap, normalMap };
}

/** Flat 1×1 stand-in until the async bake lands (base roughness, up-facing normal, no glint facets or static-glint mask). */
export function createFrostPlaceholders(): FrostMaps {
  const roughness = new Uint8Array([128, 89, 128, 0]);
  const normal = new Uint8Array([128, 128, 255, 0]);
  const roughnessMap = new DataTexture(roughness, 1, 1, RGBAFormat);
  const normalMap = new DataTexture(normal, 1, 1, RGBAFormat);
  roughnessMap.colorSpace = NoColorSpace;
  normalMap.colorSpace = NoColorSpace;
  roughnessMap.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { roughnessMap, normalMap };
}

/**
 * Seamless procedural frost maps for the shared ice material.
 * Roughness (green) and iridescence thickness share one texture;
 * normals are derived from the same height field.
 */
function createFrostMaps(): FrostMaps {
  return buffersToTextures(generateFrostBuffers());
}

let frostWorker: Worker | null = null;

/** Bake frost maps off the main thread; falls back to sync when Workers are unavailable. */
export function loadFrostMaps(): Promise<FrostMaps> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(createFrostMaps());
  }

  return new Promise((resolve, reject) => {
    frostWorker ??= new Worker(new URL("./frost.worker.ts", import.meta.url), {
      type: "module",
    });

    const worker = frostWorker;
    frostWorker = null;

    worker.onmessage = (event: MessageEvent<FrostBuffers>) => {
      worker.terminate();
      resolve(buffersToTextures(event.data));
    };

    worker.onerror = (event) => {
      worker.terminate();
      reportClientError("frost-worker", event.error ?? event.message ?? "Frost worker failed");
      reject(event.error ?? new Error("Frost worker failed"));
    };
  });
}
