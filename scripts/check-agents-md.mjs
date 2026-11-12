#!/usr/bin/env node
/**
 * Fail if AGENTS.md documents unpinned CLI usage.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentsPath = path.join(root, "AGENTS.md");
const text = readFileSync(agentsPath, "utf8");

const forbidden = [
  { label: "`npx -y`", pattern: /npx -y/ },
  { label: "`@latest`", pattern: /@latest/ },
];

const hits = forbidden.filter(({ pattern }) => pattern.test(text));
if (hits.length > 0) {
  for (const { label } of hits) {
    console.error(`AGENTS.md must not contain ${label} (use pinned CLI versions and local guide search).`);
  }
  process.exit(1);
}

console.log("AGENTS.md policy: OK");
