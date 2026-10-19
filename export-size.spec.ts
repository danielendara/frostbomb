// @vitest-environment happy-dom
import { it } from "vitest";
import { appendFileSync } from "node:fs";
const R = process.env.REPO!; const OUT = process.env.OUT!;
it("export sizes", async () => {
  const { buildSnowflake } = await import(R + "/src/snowflake/geometry.ts");
  const { sampleConditions } = await import(R + "/src/snowflake/nakaya.ts");
  const { hashString, mulberry32, Rand } = await import(R + "/src/snowflake/random.ts");
  const { exportSnowflakeModels } = await import(R + "/src/snowflake/mesh-export.ts");
  const grow = (l: string) => { const r = new Rand(mulberry32(hashString(l))); return buildSnowflake(sampleConditions(r), r); };
  const o = (s: string) => appendFileSync(OUT, s + "\n");
  for (const l of ["fox", "nov", "charlie", "alpha", "whisky"]) {
    const f = grow(l); const { stl, glb } = await exportSnowflakeModels(f);
    const sb = (await stl.arrayBuffer()).byteLength, gb = (await glb.arrayBuffer()).byteLength;
    o(`${l}\tinst=${f.matrices.length / 16}\tstlTris=${(sb - 84) / 50}\tstl=${sb}\tglb=${gb}`);
  }
  let worst = { l: "", inst: 0 };
  for (let i = 0; i < 1000; i++) { const l = `s${i}`; const n = grow(l).matrices.length / 16; if (n > worst.inst) worst = { l, inst: n }; }
  const f = grow(worst.l); const { stl, glb } = await exportSnowflakeModels(f);
  o(`worst-of-1000 (labels s0..s999): ${worst.l}\tinst=${worst.inst}\tstl=${(await stl.arrayBuffer()).byteLength}\tglb=${(await glb.arrayBuffer()).byteLength}`);
}, 600000);
