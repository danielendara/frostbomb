import { generateFrostBuffers } from "./frost-data";

const { roughnessData, normalData } = generateFrostBuffers();

self.postMessage(
  { roughnessData, normalData },
  { transfer: [roughnessData.buffer, normalData.buffer] },
);
