#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";

const browser = await chromium.launch({
  headless: true,
  args: [
    "--headless=new",
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const context = await browser.newContext();
const page = await context.newPage();
const client = await context.newCDPSession(page);
await client.send("Performance.enable");

const t0 = Date.now();
await page.goto(url, { waitUntil: "load", timeout: 120_000 });
await page.waitForFunction(
  () => document.querySelector("#scene")?.getAttribute("data-scene-nonblank") === "true",
  { timeout: 60_000 },
);
await page.waitForTimeout(500);

const metrics = await client.send("Performance.getMetrics");
const trace = await client.send("Tracing.getCategories");

// CPU profile via Profiler
await client.send("Profiler.enable");
await client.send("Profiler.start");
await page.reload({ waitUntil: "load" });
await page.waitForFunction(
  () => document.querySelector("#scene")?.getAttribute("data-scene-nonblank") === "true",
  { timeout: 60_000 },
);
const { profile } = await client.send("Profiler.stop");

function flatten(nodes, map = new Map()) {
  for (const n of nodes) {
    if (n.callFrame?.url) {
      const key = n.callFrame.url.split("/").pop() || n.callFrame.url;
      map.set(key, (map.get(key) ?? 0) + (n.hitCount ?? 0));
    }
    if (n.children) flatten(n.children, map);
  }
  return map;
}

const hits = flatten(profile.nodes);
const top = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log("Top profile files by hitCount (reload):");
for (const [k, v] of top) console.log(`  ${v}\t${k}`);

writeFileSync("/workspace/.perf-profile.json", JSON.stringify({ metrics, top }, null, 2));
await browser.close();
