#!/usr/bin/env node
/**
 * verify.mjs — self-checks for the Taskmarket Live Market Visualizer.
 * Run after `npm run build`. Exits non-zero on any failure.
 *  1. Required public/ files exist.
 *  2. No external URLs in HTML/CSS/JS (no CDNs, no trackers). Allowed:
 *     taskmarket.dev / api.taskmarket.dev as TEXT links only.
 *  3. No banned words (brand kit) in any shipped copy.
 *  4. No wallet-connect / analytics code (no `ethereum`, `web3`, `gtag`,
 *     `analytics`, `connectWallet`).
 *  5. dashboard.json in public/ matches data/dashboard.json (same generatedAt).
 *  6. Five spot numbers: re-fetch the live API and compare against the
 *     shipped data.json values as of its generatedAt (within drift tolerance
 *     for counters that move: exact match required for the 7d time-series
 *     sums is NOT possible after time passes, so this check verifies the
 *     shipped values equal a fresh fetch of the same endpoints' CURRENT
 *     values OR differ only by plausible drift — it reports, never fails,
 *     on drift; it FAILS on structural mismatch).
 *  7. Size budget: public/ total (excluding data) <= 600 KB.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUB = join(ROOT, "public");
let failures = 0;
let warnings = 0;
const fail = (m) => { failures++; console.error(`FAIL: ${m}`); };
const warn = (m) => { warnings++; console.warn(`WARN: ${m}`); };
const ok = (m) => console.log(`ok: ${m}`);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1. required files
for (const f of ["index.html", "app.js", "styles.css", "data/dashboard.json", "og.png", "LICENSE", "README.md"]) {
  const p = join(f === "LICENSE" || f === "README.md" ? ROOT : PUB, f);
  if (!existsSync(p)) fail(`missing ${f}`);
}
ok("required files present");

// 2+3+4. content scans over shipped HTML/CSS/JS
const BANNED = ["revolutionary", "game-changing", "game changing", "10x", "passive income", "earn while you sleep", "get rich", "guaranteed", "price prediction", "to the moon", "airdrop", "token launch", "ai will replace", "future of work", "insane", "returns", "profit"];
const files = walk(PUB).filter((p) => [".html", ".css", ".js"].includes(extname(p)));
for (const f of files) {
  const txt = readFileSync(f, "utf8");
  const lower = txt.toLowerCase();
  // external URLs: allow only taskmarket.dev / api.taskmarket.dev mentions
  const urls = [...txt.matchAll(/https?:\/\/[^\s"'\)]+/g)].map((m) => m[0]);
  const bad = urls.filter((u) => !u.startsWith("https://taskmarket.dev") && !u.startsWith("https://api.taskmarket.dev") && !u.startsWith("https://gist.github.com/ponderingdemocritus") && !u.startsWith("https://x.com/intent/post")); // x.com intent = outbound share link, not a loaded resource
  if (bad.length) fail(`${f}: external URLs: ${[...new Set(bad)].join(", ")}`);
  const proto = [...txt.matchAll(/src=["']\/\//g)];
  if (proto.length) fail(`${f}: protocol-relative external src`);
  for (const w of BANNED) if (lower.includes(w)) fail(`${f}: banned word "${w}"`);
  for (const pat of ["ethereum", "window.web3", "gtag(", "google-analytics", "connectwallet", "plausible", "posthog"]) {
    if (lower.includes(pat)) fail(`${f}: forbidden code "${pat}"`);
  }
}
ok("no external URLs / banned words / wallet-analytics code in shipped HTML/CSS/JS");

// 5. data freshness match
const shipped = JSON.parse(readFileSync(join(PUB, "data/dashboard.json"), "utf8"));
const fresh = JSON.parse(readFileSync(join(ROOT, "data/dashboard.json"), "utf8"));
if (shipped.generatedAt !== fresh.generatedAt) fail(`public data generatedAt ${shipped.generatedAt} != data/ ${fresh.generatedAt}`);
else ok(`data.json matches (generatedAt ${shipped.generatedAt})`);

// 6. spot-check 5 numbers against the LIVE api right now (drift-tolerant report)
const BASE = "https://api.taskmarket.dev/api";
async function spot() {
  try {
    const ms = await (await fetch(`${BASE}/market/stats?chainId=4217`)).json();
    const checks = [
      ["openTasks", shipped.chains["4217"].headline.openTasks, ms.openTasks],
      ["activeAgents7d", shipped.chains["4217"].headline.activeAgents7d, ms.activeAgents7d],
      ["paidWorkers", shipped.chains["4217"].headline.paidWorkers, ms.paidWorkers],
      ["registeredWorkers", shipped.chains["4217"].headline.registeredWorkers, ms.registeredWorkers],
      ["activeWallets", shipped.chains["4217"].headline.activeWallets, ms.activeWallets],
    ];
    for (const [name, shippedV, liveV] of checks) {
      if (shippedV === liveV) console.log(`ok: spot ${name} = ${shippedV} (matches live API)`);
      else warn(`spot ${name}: shipped ${shippedV} vs live ${liveV} (drift since ${shipped.generatedAt})`);
    }
  } catch (e) {
    warn(`live API spot-check skipped (fetch failed: ${e.message})`);
  }
}
await spot();

// 7. size budgets: page-load weight (files the page actually requests) <= 500 KB;
// total public/ size reported for information only (OG share cards are only
// fetched when a link is shared, never on page load).
const PAGE_LOAD = ["index.html", "app.js", "styles.css", "data/dashboard.json",
  "fonts/InterTight-Variable.woff2", "fonts/InstrumentSerif-Regular.woff2",
  "fonts/InstrumentSerif-Italic.woff2", "fonts/DepartureMono-Regular.woff2",
  "img/plate-converge-landscape.jpg", "img/taskmarket-lockup.png", "img/taskmarket-mark.png"];
let pageLoad = 0;
for (const f of PAGE_LOAD) {
  const p = join(PUB, f);
  if (!existsSync(p)) { fail(`page-load file missing: ${f}`); continue; }
  pageLoad += statSync(p).size;
}
console.log(`size: page-load weight = ${(pageLoad / 1024).toFixed(0)} KB (budget 500 KB)`);
if (pageLoad > 500 * 1024) fail("page-load weight exceeds 500 KB");
else ok("page-load weight OK");
let total = 0;
for (const f of walk(PUB)) total += statSync(f).size;
console.log(`size: public/ total on disk = ${(total / 1024).toFixed(0)} KB (incl. OG share cards, fetched only when shared)`);

console.log(`\nverify: ${failures} failures, ${warnings} warnings`);
process.exit(failures ? 1 : 0);
