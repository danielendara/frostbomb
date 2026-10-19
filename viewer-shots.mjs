import { chromium } from "/workspace/frostbomb-441-2026-10-19/frostbomb/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
for (const [file, fmt, zoom, out] of [["charlie","stl","full","stl-charlie"],["charlie","glb","full","glb-charlie"],["whisky","stl","core","stl-whisky-core"],["whisky","glb","core","glb-whisky-core"]]) {
  await p.goto(`http://127.0.0.1:18790/?file=${file}&fmt=${fmt}&zoom=${zoom}`);
  await p.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
  await p.screenshot({ path: `/tmp/fb441v2/viewer-out/${out}.png` });
  console.log(out);
}
await b.close();
