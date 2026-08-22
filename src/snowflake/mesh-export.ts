import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { BuildResult, InstanceData } from "./geometry";

/** Long-axis size in millimetres. STL/GLB are unitless; most slicers treat this as mm. */
const PHYSICAL_MM = 50;

function coreMatrix(core: InstanceData): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(core.position[0], core.position[1], core.position[2]),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(core.rotation[0], core.rotation[1], core.rotation[2], "XYZ"),
    ),
    new THREE.Vector3(core.scale[0], core.scale[1], core.scale[2]),
  );
}

function toArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  }
  throw new Error("Export payload was not binary");
}

function scaleToPhysicalMm(geom: THREE.BufferGeometry): void {
  geom.computeBoundingBox();
  const box = geom.boundingBox;
  if (!box) return;
  const size = new THREE.Vector3();
  box.getSize(size);
  const long = Math.max(size.x, size.y, size.z, 1e-6);
  const s = PHYSICAL_MM / long;
  geom.scale(s, s, s);
}

/**
 * Merge instanced hex-cylinders and the core into one mesh.
 * Segments overlap; this is not a watertight boolean union.
 */
export function bakeExportGeometry(data: BuildResult): THREE.BufferGeometry {
  const proto = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false);
  const pos = proto.getAttribute("position") as THREE.BufferAttribute;
  const nrm = proto.getAttribute("normal") as THREE.BufferAttribute;
  const idx = proto.getIndex();
  if (!idx) {
    proto.dispose();
    throw new Error("Export cylinder is missing an index");
  }

  const vCount = pos.count;
  const iCount = idx.count;
  const instN = data.matrices.length / 16;
  const total = instN + 1;

  const positions = new Float32Array(total * vCount * 3);
  const normals = new Float32Array(total * vCount * 3);
  const indices = new Uint32Array(total * iCount);

  const matrix = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const bake = (m: THREE.Matrix4, instance: number) => {
    normalMatrix.getNormalMatrix(m);
    const vertexOffset = instance * vCount * 3;
    const indexOffset = instance * iCount;
    const indexBase = instance * vCount;

    for (let i = 0; i < vCount; i++) {
      vertex.fromBufferAttribute(pos, i).applyMatrix4(m);
      normal.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
      const o = vertexOffset + i * 3;
      positions[o] = vertex.x;
      positions[o + 1] = vertex.y;
      positions[o + 2] = vertex.z;
      normals[o] = normal.x;
      normals[o + 1] = normal.y;
      normals[o + 2] = normal.z;
    }

    for (let i = 0; i < iCount; i++) {
      indices[indexOffset + i] = idx.getX(i) + indexBase;
    }
  };

  for (let i = 0; i < instN; i++) {
    matrix.fromArray(data.matrices, i << 4);
    bake(matrix, i);
  }
  bake(coreMatrix(data.core), instN);

  proto.dispose();

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));
  scaleToPhysicalMm(geom);
  return geom;
}

export async function exportSnowflakeModels(
  data: BuildResult,
): Promise<{ stl: Blob; glb: Blob }> {
  const geom = bakeExportGeometry(data);
  const mesh = new THREE.Mesh(
    geom,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.35,
    }),
  );

  const stl = new STLExporter().parse(mesh, { binary: true });

  const exportScene = new THREE.Scene();
  exportScene.add(mesh);
  const glb = await new GLTFExporter().parseAsync(exportScene, {
    binary: true,
  });

  geom.dispose();
  mesh.material.dispose();

  return {
    stl: new Blob([toArrayBuffer(stl)], { type: "model/stl" }),
    glb: new Blob([toArrayBuffer(glb)], { type: "model/gltf-binary" }),
  };
}
