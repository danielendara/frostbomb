// Mode shots for PR #446 proof (tip build on :8788). There is no "Glow" mode on main; the
// baseline shot is the default look (no pink/prism flags).
import { chromium } from "/tmp/fb441v2/tip/node_modules/@playwright/test/index.mjs";
const b = await chromium.launch();
for (const [name, q] of [["default", "&pink=0&prism=0"], ["pink", "&pink=1&prism=0"], ["prism", "&pink=0&prism=1"]]) for (const tier of ["rich", "lite"]) {
  const p = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
  await p.goto(`http://127.0.0.1:8788/?seed=alpha&rotate=0&quality=${tier}${q}`);
  await p.waitForSelector('canvas[data-entry-active="false"]', { timeout: 60000 });
  await p.waitForTimeout(800);
  console.log(name, tier, "data-quality =", await p.getAttribute("canvas", "data-quality"));
  await p.screenshot({ path: `/tmp/fb441v2/modes/modes-after-${name}-${tier}.png` });
}
await b.close();
