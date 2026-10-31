#!/usr/bin/env node
/**
 * Fail if docs/ contain pre-public internal ops phrases (case-insensitive).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const pattern = /the Mac|shared box|spend cap/i;

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

/** @type {{ file: string; line: number; text: string }[]} */
const hits = [];
for (const file of walk(docsDir)) {
  const rel = path.relative(root, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, index) => {
    if (pattern.test(text)) {
      hits.push({ file: rel, line: index + 1, text: text.trim() });
    }
  });
}

if (hits.length > 0) {
  console.error("docs/ must not mention the Mac, shared box, or spend cap:");
  for (const { file, line, text } of hits) {
    console.error(`  ${file}:${line}: ${text}`);
  }
  process.exit(1);
}

console.log("docs/ hygiene: OK");
