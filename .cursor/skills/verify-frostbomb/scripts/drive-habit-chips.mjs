// Usage: node .cursor/skills/verify-frostbomb/scripts/drive-habit-chips.mjs <base-url> <evidence-dir>
// Drives the real UI: open a seeded crystal, enable Lab Mode, click a habit chip, press Back.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const [base = 'http://127.0.0.1:5173', out = '/tmp/frostbomb-evidence'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const log = (...a) => console.log(...a);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/?seed=abcde`);
await page.waitForFunction(() => document.querySelector('#seed-display')?.textContent === 'abcde');
await page.waitForTimeout(3000); // let the crystal grow
log('before: url', page.url(), 'habit', await page.locator('#stat-habit').textContent());
await page.screenshot({ path: `${out}/01-before-seed-abcde.png` });


await page.click('#lab-toggle');
await page.waitForFunction(() => document.querySelector('#lab-status')?.textContent === 'ON');
log('lab-status ON; chips:', await page.locator('#habit-chips .habit-chip').count());
const labUrl = page.url(); // Lab toggle pushes its own history entry
await page.locator('#habit-chips .habit-chip[data-habit="needle"]').click();
await page.waitForFunction(() => document.querySelector('#stat-habit')?.textContent === 'Needle');
await page.waitForTimeout(2500);
log('after chip: url', page.url(), 'habit', await page.locator('#stat-habit').textContent(),
  'aria-pressed', await page.locator('#habit-chips .habit-chip[data-habit="needle"]').getAttribute('aria-pressed'));
await page.screenshot({ path: `${out}/02-after-needle-chip.png` });

await page.goBack();
await page.waitForTimeout(1500);
log('after Back: url', page.url(), 'returned-to-previous:', page.url() === labUrl);
await page.screenshot({ path: `${out}/03-after-back.png` });
log('page errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
