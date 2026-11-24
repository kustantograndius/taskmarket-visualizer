#!/usr/bin/env node
/**
 * build.mjs — assemble public/ for deployment.
 *  1. node scripts/fetch.mjs        (server-side API fetch -> data/dashboard.json)
 *  2. python3 scripts/og.py         (share cards from the fresh data; skipped if missing)
 *  3. copy data/dashboard.json minified -> public/data/dashboard.json
 *  4. copy prepared assets (public/fonts, public/img) — already in place
 * No network calls except the API fetch in step 1. No dependencies.
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.status !== 0) throw new Error(`command failed: ${cmd} ${args.join(" ")}`);
}

console.log("== fetch ==");
run("node", ["scripts/fetch.mjs"]);

if (existsSync(join(ROOT, "scripts", "og.py"))) {
  console.log("== share cards ==");
  try {
    run("python3", ["scripts/og.py"]);
  } catch (e) {
    console.warn("og.py failed (continuing without fresh share cards):", e.message);
  }
}

console.log("== assemble public/ ==");
mkdirSync(join(PUB, "data"), { recursive: true });
const doc = JSON.parse(readFileSync(join(ROOT, "data", "dashboard.json"), "utf8"));
writeFileSync(join(PUB, "data", "dashboard.json"), JSON.stringify(doc));
console.log(`public/data/dashboard.json: ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB minified, generatedAt ${doc.generatedAt}`);

// sanity: required entry files
for (const f of ["index.html", "app.js", "styles.css"]) {
  if (!existsSync(join(PUB, f))) throw new Error(`missing public/${f} — frontend not built yet`);
}
console.log("build OK");
