import { buildSnowflake } from "./geometry";
import type { GrowthConditions } from "./nakaya";
import { sampleConditions } from "./nakaya";
import { mulberry32, Rand } from "./random";

export interface GeometryWorkerRequest {
  seed: number;
  manualConditions?: GrowthConditions;
}

self.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
  const { seed, manualConditions } = event.data;
  const rng = mulberry32(seed);
  const rand = new Rand(rng);
  const conditions = manualConditions ?? sampleConditions(rand);
  const result = buildSnowflake(conditions, rand);
  self.postMessage(
    {
      armCount: result.armCount,
      delays: result.delays,
      matrices: result.matrices,
      branchCount: result.branchCount,
      core: result.core,
    },
    { transfer: [result.delays.buffer, result.matrices.buffer] },
  );
};
