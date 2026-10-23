import { createRequire } from 'node:module';
const require = createRequire('/workspace/phaseB/p1/frostbomb-461/package.json');
const { chromium } = require('@playwright/test');
const [,, outDir] = process.argv;
const DELAY = 300; // ms added to every request, emulating network latency
const targets = { before: 'http://127.0.0.1:4101/?seed=abcde', after: 'http://127.0.0.1:4102/?seed=abcde' };
const browser = await chromium.launch();
const results = {};
for (const [name, url] of Object.entries(targets)) {
  results[name] = [];
  for (let run = 1; run <= 3; run++) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1, isMobile: true });
    const page = await ctx.newPage();
    await page.route('**/*', async r => { await new Promise(s => setTimeout(s, DELAY)); r.continue(); });
    await page.addInitScript(() => {
      window.__m = { cls: 0, shifts: [], lcp: null, fcp: null };
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) { __m.cls += e.value; __m.shifts.push(e.value); } }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) __m.lcp = { t: e.startTime, el: e.element?.className || e.element?.tagName }; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') __m.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
    });
    // sample wordmark font state/box every animation frame
    await page.addInitScript(() => {
      window.__f = [];
      const tick = () => {
        const w = document.querySelector('.wordmark');
        if (w) { const r = w.getBoundingClientRect(); __f.push({ t: Math.round(performance.now()), w: Math.round(r.width * 10) / 10, loaded: document.fonts.check('italic 300 20px "Cormorant Garamond"') }); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(url, { waitUntil: 'commit' });
    let shotFallback = false;
    if (false) {
      // capture a frame once wordmark is painted but font not yet loaded
      for (let i = 0; i < 400 && !shotFallback; i++) {
        const s = await page.evaluate(() => { const f = __f.at(-1); return f ? f.w : null; }).catch(() => null);
        if (s !== null && s === await page.evaluate(() => __f[0].w).catch(() => null) && await page.evaluate(() => __m.fcp !== null).catch(() => false)) { const cdp = await ctx.newCDPSession(page); const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(`${outDir}/${name}-early.png`, Buffer.from(data, 'base64')); shotFallback = true; }
        await page.waitForTimeout(10);
      }
    }
    await page.waitForLoadState('load');
    await page.waitForTimeout(3000);
    if (run === 1) await page.screenshot({ path: `${outDir}/${name}-settled.png` });
    const m = await page.evaluate(() => {
      const f = __f; const firstShown = f[0]; const firstLoaded = f.find(x => x.w !== f[0].w);
      const widths = [...new Set(f.map(x => x.w))];
      return { ...__m, wordmarkFirstFrame: firstShown, wordmarkSwapFrame: firstLoaded, wordmarkWidths: widths,
        fontMs: performance.getEntriesByType('resource').filter(r => r.name.includes('300-italic')).map(r => ({ start: Math.round(r.startTime), end: Math.round(r.responseEnd) })) };
    });
    m.fallbackShotTaken = shotFallback;
    results[name].push(m);
    await ctx.close();
  }
}
await browser.close();
import('node:fs').then(fs => fs.writeFileSync(`${outDir}/swap-results.json`, JSON.stringify(results, null, 1)));
console.log(JSON.stringify(results, null, 1));
