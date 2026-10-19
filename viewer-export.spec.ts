// @vitest-environment happy-dom
import { it } from "vitest";
import { writeFileSync } from "node:fs";
const R = process.env.REPO!, OUT = process.env.OUT!;
it("export files", async () => {
  const { buildSnowflake } = await import(R + "/src/snowflake/geometry.ts");
  const { sampleConditions } = await import(R + "/src/snowflake/nakaya.ts");
  const { hashString, mulberry32, Rand } = await import(R + "/src/snowflake/random.ts");
  const { exportSnowflakeModels } = await import(R + "/src/snowflake/mesh-export.ts");
  for (const label of ["charlie", "whisky"]) {
    const rand = new Rand(mulberry32(hashString(label)));
    const { stl, glb } = await exportSnowflakeModels(buildSnowflake(sampleConditions(rand), rand));
    writeFileSync(`${OUT}/${label}.stl`, Buffer.from(await stl.arrayBuffer()));
    writeFileSync(`${OUT}/${label}.glb`, Buffer.from(await glb.arrayBuffer()));
  }
}, 120000);
