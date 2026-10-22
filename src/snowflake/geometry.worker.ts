import { buildSnowflake } from "./geometry";
import type { GrowthConditions } from "./nakaya";
import { mulberry32, Rand } from "./random";

export interface GeometryWorkerRequest {
  conditions: GrowthConditions;
  seed: number;
}

self.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
  const { conditions, seed } = event.data;
  const result = buildSnowflake(conditions, new Rand(mulberry32(seed)));
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
