// usage: node viewer-shots.mjs <port> <outdir>   renders STL/GLB from the files served on <port>
import { chromium } from "/tmp/fb441v2/tip/node_modules/@playwright/test/index.mjs";
const [port, out, stamp] = [process.argv[2], process.argv[3], process.argv[4] ?? ""];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
for (const [file, fmt, zoom, name] of [["charlie","stl","full","stl-charlie"],["charlie","glb","full","glb-charlie"],["whisky","stl","core","stl-whisky-core"],["whisky","glb","core","glb-whisky-core"]]) {
  await p.goto(`http://127.0.0.1:${port}/?file=${file}&fmt=${fmt}&zoom=${zoom}&stamp=${encodeURIComponent(stamp)}&t=${Date.now()}`);
  await p.waitForFunction(() => window.__done === true, null, { timeout: 60000 });
  await p.screenshot({ path: `${out}/${process.argv[5] ?? "viewer"}-${name}.png` });
  console.log(name, await p.textContent("#l"));
}
await b.close();
