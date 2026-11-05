import type * as THREE from "three";
import type { QualityTier } from "./quality";

/** Photographic ice look (Glow off). Exported for unit tests. */
export interface PhotoIceMaterialParams {
  roughness: number;
  transmission: number;
  thickness: number;
  ior: number;
  dispersion: number;
  iridescence: number;
  clearcoat: number;
  clearcoatRoughness: number;
  attenuationColor: string;
  attenuationDistance: number;
  specularIntensity: number;
}

export const PHOTO_ICE_BY_TIER: Readonly<Record<QualityTier, PhotoIceMaterialParams>> = {
  rich: {
    roughness: 0.08,
    transmission: 1,
    thickness: 1.25,
    ior: 1.31,
    dispersion: 0.3,
    iridescence: 0.35,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
    attenuationColor: "#88ccff",
    attenuationDistance: 2.5,
    specularIntensity: 1,
  },
  lite: {
    roughness: 0.08,
    transmission: 0,
    thickness: 0.75,
    ior: 1.31,
    dispersion: 0,
    iridescence: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.1,
    attenuationColor: "#88ccff",
    attenuationDistance: 1.5,
    specularIntensity: 1.2,
  },
};

export function applyPhotoIceMaterial(material: THREE.MeshPhysicalMaterial, tier: QualityTier): void {
  const p = PHOTO_ICE_BY_TIER[tier];
  material.roughness = p.roughness;
  material.transmission = p.transmission;
  material.thickness = p.thickness;
  material.ior = p.ior;
  material.dispersion = p.dispersion;
  material.iridescence = p.iridescence;
  material.clearcoat = p.clearcoat;
  material.clearcoatRoughness = p.clearcoatRoughness;
  material.attenuationColor.set(p.attenuationColor);
  material.attenuationDistance = p.attenuationDistance;
  material.specularIntensity = p.specularIntensity;
  material.needsUpdate = true;
}
