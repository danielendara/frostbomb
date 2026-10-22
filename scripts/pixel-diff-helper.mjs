import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const [aPath, bPath, diffPath] = process.argv.slice(2);
const a = PNG.sync.read(readFileSync(aPath));
const b = PNG.sync.read(readFileSync(bPath));
if (a.width !== b.width || a.height !== b.height) {
  console.log(JSON.stringify({ pct: 100, reason: "dimension mismatch" }));
  process.exit(0);
}
const diff = new PNG({ width: a.width, height: a.height });
const numDiff = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
if (diffPath) writeFileSync(diffPath, PNG.sync.write(diff));
const pct = (numDiff / (a.width * a.height)) * 100;
console.log(JSON.stringify({ pct, numDiff }));
