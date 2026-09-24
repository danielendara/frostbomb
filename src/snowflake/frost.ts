import * as THREE from "three";
import { FROST_SIZE, generateFrostBuffers, type FrostBuffers } from "./frost-data";
import { reportClientError } from "../ui/client-error";

function configureMap(texture: THREE.DataTexture): THREE.DataTexture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Hex-cylinder faces are thin in U and long in V; denser tiling keeps
  // frost as grain instead of a dashed ridge along each arm.
  texture.repeat.set(6, 10);
  texture.anisotropy = 8;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buffersToTextures(buffers: FrostBuffers): {
  roughnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
} {
  const roughnessMap = configureMap(
    new THREE.DataTexture(buffers.roughnessData, FROST_SIZE, FROST_SIZE, THREE.RGBAFormat),
  );
  const normalMap = configureMap(
    new THREE.DataTexture(buffers.normalData, FROST_SIZE, FROST_SIZE, THREE.RGBAFormat),
  );
  return { roughnessMap, normalMap };
}

/** Flat 1×1 stand-in until the async bake lands (base roughness, up-facing normal). */
export function createFrostPlaceholders(): {
  roughnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
} {
  const roughness = new Uint8Array([89, 89, 89, 255]);
  const normal = new Uint8Array([128, 128, 255, 255]);
  const roughnessMap = new THREE.DataTexture(roughness, 1, 1, THREE.RGBAFormat);
  const normalMap = new THREE.DataTexture(normal, 1, 1, THREE.RGBAFormat);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  normalMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.needsUpdate = true;
  normalMap.needsUpdate = true;
  return { roughnessMap, normalMap };
}

/**
 * Seamless procedural frost maps for the shared ice material.
 * Roughness (green) and iridescence thickness share one texture;
 * normals are derived from the same height field.
 */
export function createFrostMaps(): {
  roughnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
} {
  return buffersToTextures(generateFrostBuffers());
}

let frostWorker: Worker | null = null;

/** Bake frost maps off the main thread; falls back to sync when Workers are unavailable. */
export function loadFrostMaps(): Promise<{
  roughnessMap: THREE.DataTexture;
  normalMap: THREE.DataTexture;
}> {
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
