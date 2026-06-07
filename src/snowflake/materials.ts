import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export function createIceBumpMap(): THREE.CanvasTexture {
  const size = 512;
  const coordinateStep = 4 / size;
  const octaveNormalization = 1 / 1.75;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;

  const imgData = context.createImageData(size, size);
  const data = imgData.data;
  const noise2D = createNoise2D();

  let ny = 0;
  for (let y = 0; y < size; y++, ny += coordinateStep) {
    let nx = 0;
    for (let x = 0; x < size; x++, nx += coordinateStep) {
      const val = (
        (noise2D(nx, ny) * 0.5 + 0.5)
        + (noise2D(nx * 2, ny * 2) * 0.5 + 0.5) * 0.5
        + (noise2D(nx * 4, ny * 4) * 0.5 + 0.5) * 0.25
      ) * octaveNormalization;

      const color = Math.floor(val * 255);
      const idx = (y * size + x) * 4;
      data[idx] = color;
      data[idx + 1] = color;
      data[idx + 2] = color;
      data[idx + 3] = 255;
    }
  }

  context.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

export function createEnvironmentMap(): THREE.DataTexture {
  const width = 512;
  const height = 256;
  const size = width * height;
  const data = new Uint8Array(4 * size);
  const keyMinX = width * 0.2;
  const keyMaxX = width * 0.3;
  const fillMinX = width * 0.72;
  const fillMaxX = width * 0.78;

  for (let y = 0; y < height; y++) {
    const v = y / height;
    const isKeyRow = Math.abs(v - 0.6) < 0.1;
    const isFillRow = Math.abs(v - 0.5) < 0.05;

    let intensity = 0;
    if (v < 0.4) {
      intensity = 0.05 + (v / 0.4) * 0.1;
    } else if (v < 0.6) {
      intensity = 0.8 + Math.sin((v - 0.4) * Math.PI / 0.2) * 0.2;
    } else {
      intensity = 0.3 - ((v - 0.6) / 0.4) * 0.2;
    }

    const r = Math.min(255, Math.floor(255 * intensity * 0.9));
    const g = Math.min(255, Math.floor(255 * intensity * 0.95));
    const b = Math.min(255, Math.floor(255 * intensity * 1.0));

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      let spot = 0;
      if (isKeyRow && x > keyMinX && x < keyMaxX) spot = 1.0;
      if (isFillRow && x > fillMinX && x < fillMaxX) spot = 0.5;

      data[idx] = Math.min(255, r + spot * 255);
      data[idx + 1] = Math.min(255, g + spot * 255);
      data[idx + 2] = Math.min(255, b + spot * 255);
      data[idx + 3] = 255;
    }
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function createIceMaterial(bumpMap: THREE.CanvasTexture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.95,
    thickness: 0.8,
    ior: 1.31,
    dispersion: 0.03,
    reflectivity: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    bumpMap: bumpMap,
    bumpScale: 0.015,
    envMapIntensity: 1.5,
    attenuationColor: new THREE.Color('#b5d4ed'),
    attenuationDistance: 2.0,
    transparent: true,
    opacity: 1.0,
    emissive: new THREE.Color('#e0f0ff'),
    emissiveIntensity: 0.1,
  });
}
