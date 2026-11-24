#!/usr/bin/env node
/**
 * fetch.mjs — Taskmarket Live Market Visualizer: server-side data fetch.
 *
 * Runs in CI (GitHub Actions, hourly) and locally (`npm run fetch`).
 * Fetches ONLY from the public Taskmarket API (no key), derives aggregates,
 * and writes data/dashboard.json. Every number in the output is either
 * returned verbatim by the API or computed from API responses — nothing is
 * invented. Money is in micro units in the API (1 OUSD/USDC = 1,000,000);
 * we keep micro units in the JSON and convert at render time.
 *
 * Failure policy: an endpoint that fails after retries keeps the previous
 * file's section (marked stale). A first run with no previous file fails
 * loudly (exit 1) instead of shipping invented data.
 */
import { writeFileSync, readFileSync, existsSync, renameSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "dashboard.json");
const LOG = join(ROOT, "data", "fetch-log.json");
const BASE = "https://api.taskmarket.dev/api";
const CHAINS = ["4217", "8453"]; // Tempo, Base
const TASK_PAGES_MAX = 40; // 100 tasks/page, newest first
const TASK_COVER_DAYS = 56;
const FEED_PAGES_MAX = 12; // 50 items/page
const FEED_COVER_HOURS = 48;

const log = [];
function note(endpoint, status, ms, detail = "") {
  log.push({ endpoint, status, ms, detail, at: new Date().toISOString() });
}

async function getJSON(path, tries = 3) {
  const url = `${BASE}${path}`;
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 30000);
      const res = await fetch(url, {
        headers: { "User-Agent": "taskmarket-visualizer/1.0 (+https://taskmarket.dev)" },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      note(path, res.status, Date.now() - t0);
      return JSON.parse(text);
    } catch (e) {
      lastErr = e;
      note(path, "error", Date.now() - t0, String(e).slice(0, 200));
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr;
}

function isoWeekStart(d) {
  // Monday 00:00 UTC of the ISO week containing d
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

function shortAddr(a) {
  return typeof a === "string" && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

async function fetchChain(chainId, prev) {
  const out = {};
  // 1. headline
  out.marketStats = await getJSON(`/market/stats?chainId=${chainId}`);
  // 2. breakdowns
  out.breakdowns = await getJSON(`/stats/breakdowns?chainId=${chainId}`);
  // 3. time series, all ranges
  out.timeSeries = {};
  for (const [range, bucket] of [["7d", "day"], ["30d", "day"], ["90d", "day"], ["all", "week"]]) {
    out.timeSeries[range] = await getJSON(
      `/stats/platform-time-series?chainId=${chainId}&range=${range}&bucket=${bucket}`
    );
  }
  // 4. heatmaps
  out.heatmapHourOfWeek = await getJSON(
    `/stats/activity-heatmap?chainId=${chainId}&range=30d&dimension=hourOfWeek`
  );
  out.heatmapMode = await getJSON(
    `/stats/activity-heatmap?chainId=${chainId}&range=30d&dimension=mode`
  );
  return out;
}

async function fetchTasks(chainId) {
  // Newest first, paginate until older than TASK_COVER_DAYS or page cap.
  const cutoff = Date.now() - TASK_COVER_DAYS * 86400e3;
  const tasks = [];
  let cursor = null;
  for (let p = 0; p < TASK_PAGES_MAX; p++) {
    const q = `/tasks?chainId=${chainId}&sort=newest&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await getJSON(q);
    const list = page.tasks || [];
    if (!list.length) break;
    for (const t of list) {
      tasks.push({
        id: t.id,
        referenceCode: t.referenceCode,
        requester: t.requester,
        requesterDisplayName: t.requesterDisplayName || null,
        requesterActorType: t.requesterActorType || null,
        createdAt: t.createdAt,
        expiryTime: t.expiryTime,
        status: t.status,
        mode: t.mode,
        reward: Number(t.reward || 0),
        submissionCount: t.submissionCount || 0,
        tags: t.tags || [],
      });
    }
    const oldest = new Date(list[list.length - 1].createdAt).getTime();
    if (oldest < cutoff) break;
    cursor = page.nextCursor || list[list.length - 1].createdAt;
    if (!cursor) break;
  }
  // Dedupe by id (cursor semantics may overlap pages).
  const seen = new Set();
  return tasks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

async function fetchFeed(chainId) {
  // Paginate back up to FEED_COVER_HOURS, collecting event types.
  const cutoff = Date.now() - FEED_COVER_HOURS * 3600e3;
  const items = [];
  let cursor = null;
  for (let p = 0; p < FEED_PAGES_MAX; p++) {
    const q = `/stats/activity-feed?chainId=${chainId}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await getJSON(q);
    const list = page.items || [];
    if (!list.length) break;
    items.push(...list);
    const oldest = new Date(list[list.length - 1].timestamp).getTime();
    if (oldest < cutoff) break;
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return items;
}

function sumMicro(points, field) {
  return points.reduce((a, p) => a + Number(p[field] || 0), 0);
}

function derive(chainId, c, tasks, feed, allTasksById) {
  const now = new Date();
  const ms = c.marketStats;
  const ts7 = c.timeSeries["7d"] || [];
  const ts30 = c.timeSeries["30d"] || [];
  const byId = allTasksById || new Map(tasks.map((t) => [t.id, t]));

  // --- headline (verbatim API values) ---
  const headline = {
    openTasks: ms.openTasks,
    activeAgents7d: ms.activeAgents7d,
    activeWorkers7d: ms.activeWorkers7d,
    paidWorkers: ms.paidWorkers,
    registeredWorkers: ms.registeredWorkers,
    activeWallets: ms.activeWallets,
    tasksCreated7d: ts7.reduce((a, p) => a + (p.tasksCreated || 0), 0),
    completedTasks7d: ts7.reduce((a, p) => a + (p.completedTasks || 0), 0),
    rewardsPutUp7d: sumMicro(ts7, "rewardVolume"),
    rewardsPaid7d: sumMicro(ts7, "paidVolume"),
    settlements7d: ts7.reduce((a, p) => a + (p.settlements || 0), 0),
    newAgents7d: ts7.reduce((a, p) => a + (p.newAgents || 0), 0),
  };

  // --- flow: posted vs paid (7d window) + escrow open right now ---
  const openStatuses = new Set(["open", "claimed", "worker_selected", "pending_approval"]);
  const openTasks = tasks.filter(
    (t) => openStatuses.has(t.status) && new Date(t.expiryTime).getTime() > now.getTime()
  );
  const flow = {
    putUp7d: headline.rewardsPutUp7d,
    paid7d: headline.rewardsPaid7d,
    settlements7d: headline.settlements7d,
    openEscrowMicro: openTasks.reduce((a, t) => a + t.reward, 0),
    openEscrowTasks: openTasks.length,
  };

  // --- posters: distinct per ISO week (last 8 weeks) + concentration (30d) ---
  const weeks = {};
  for (const t of tasks) {
    const w = isoWeekStart(new Date(t.createdAt));
    (weeks[w] ??= new Set()).add(t.requester);
  }
  const weekKeys = Object.keys(weeks).sort().slice(-8);
  const postersPerWeek = weekKeys.map((w) => ({ week: w, distinct: weeks[w].size }));
  const cutoff30 = Date.now() - 30 * 86400e3;
  const recent = tasks.filter((t) => new Date(t.createdAt).getTime() >= cutoff30);
  const byPoster = new Map();
  for (const t of recent) {
    const e = byPoster.get(t.requester) || { requester: t.requester, displayName: t.requesterDisplayName, tasks: 0, volume: 0 };
    e.tasks += 1;
    e.volume += t.reward;
    if (!e.displayName && t.requesterDisplayName) e.displayName = t.requesterDisplayName;
    byPoster.set(t.requester, e);
  }
  const totalVol30 = [...byPoster.values()].reduce((a, e) => a + e.volume, 0);
  const topPosters = [...byPoster.values()]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10)
    .map((e) => ({ ...e, sharePct: totalVol30 ? +(100 * e.volume / totalVol30).toFixed(1) : 0 }));
  const top5Share = +(topPosters.slice(0, 5).reduce((a, e) => a + e.sharePct, 0).toFixed(1));

  // --- swarm: tasks with most submissions in the feed window ---
  const subs = new Map();
  const feedTitle = new Map();
  for (const ev of feed) {
    if (ev.type === "task_submitted") subs.set(ev.taskId, (subs.get(ev.taskId) || 0) + 1);
    if (ev.taskTitle && !feedTitle.has(ev.taskId)) feedTitle.set(ev.taskId, ev.taskTitle);
  }
  const swarm = [...subs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([taskId, count]) => {
      const t = byId.get(taskId);
      return {
        taskId,
        referenceCode: t?.referenceCode || null,
        title: feedTitle.get(taskId) || null,
        submissions: count,
        reward: t?.reward ?? null,
        status: t?.status ?? null,
      };
    });

  // --- time to decision: createdAt -> first task_completed event in feed ---
  const completedAt = new Map();
  for (const ev of feed) {
    if ((ev.type === "task_completed" || ev.type === "task_awarded" || ev.type === "settlement") && !completedAt.has(ev.taskId)) {
      completedAt.set(ev.taskId, new Date(ev.timestamp).getTime());
    }
  }
  const hours = [];
  for (const [taskId, doneMs] of completedAt) {
    const t = byId.get(taskId);
    if (t) {
      const h = (doneMs - new Date(t.createdAt).getTime()) / 3600e3;
      if (h >= 0 && h < 24 * 60) hours.push(h);
    }
  }
  hours.sort((a, b) => a - b);
  const medianHoursToDecision =
    hours.length >= 3 ? +(hours[Math.floor(hours.length / 2)]).toFixed(1) : null;

  // --- decision queue: tasks awaiting a decision right now (breakdowns) ---
  const stQ = Object.fromEntries((c.breakdowns.status || []).map((s) => [s.status, s.count]));
  const decisionQueue = {
    pendingApproval: stQ.pending_approval || 0,
    workerSelected: stQ.worker_selected || 0,
    claimed: stQ.claimed || 0,
  };
  const totalStatus = Object.values(stQ).reduce((a, b) => a + b, 0);
  const died = {
    expired: stQ.expired || 0,
    cancelled: stQ.cancelled || 0,
    completed: stQ.completed || 0,
    total: totalStatus,
    diedPct: totalStatus ? +((100 * ((stQ.expired || 0) + (stQ.cancelled || 0))) / totalStatus).toFixed(1) : 0,
  };

  // --- growth: this 7d vs previous 7d (from 30d series, day buckets) ---
  const daily = [...(c.timeSeries["30d"] || [])].sort((a, b) => a.bucket.localeCompare(b.bucket));
  const last7 = daily.slice(-7);
  const prev7 = daily.slice(-14, -7);
  const growth = {
    tasksCreatedChangePct:
      prev7.length && last7.length
        ? +((100 * (sum(last7, "tasksCreated") - sum(prev7, "tasksCreated"))) / Math.max(1, sum(prev7, "tasksCreated"))).toFixed(0)
        : null,
    activeAgentsChangePct:
      prev7.length && last7.length
        ? +((100 * (sum(last7, "activeAgents") - sum(prev7, "activeAgents"))) / Math.max(1, sum(prev7, "activeAgents"))).toFixed(0)
        : null,
  };
  function sum(arr, f) { return arr.reduce((a, p) => a + (p[f] || 0), 0); }

  // --- feed, trimmed for the page (newest 50, both chains merged later) ---
  const feedOut = feed.slice(0, 50).map((ev) => ({
    type: ev.type,
    timestamp: ev.timestamp,
    taskId: ev.taskId,
    taskTitle: ev.taskTitle || null,
    actor: ev.actor || null,
    actorShort: shortAddr(ev.actor),
    actorType: ev.actorType || null,
    actorAgentId: ev.actorAgentId ?? null,
    amount: ev.amount ?? null,
    rating: ev.rating ?? null,
  }));

  return {
    chainId,
    headline,
    flow,
    postersPerWeek,
    topPosters,
    top5SharePct: top5Share,
    posters30d: byPoster.size,
    swarm,
    medianHoursToDecision,
    decisionsSampled: hours.length,
    decisionQueue,
    died,
    growth,
    breakdowns: c.breakdowns,
    timeSeries: c.timeSeries,
    heatmapHourOfWeek: c.heatmapHourOfWeek,
    heatmapMode: c.heatmapMode,
    feed: feedOut,
    tasksFetched: tasks.length,
    feedFetched: feed.length,
  };
}

async function main() {
  mkdirSync(join(ROOT, "data"), { recursive: true });
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
  const generatedAt = new Date().toISOString();
  const chains = {};
  const errors = [];
  const raw = {};
  for (const chainId of CHAINS) {
    try {
      const c = await fetchChain(chainId, prev?.chains?.[chainId]);
      const tasks = await fetchTasks(chainId);
      const feed = await fetchFeed(chainId);
      raw[chainId] = { c, tasks, feed };
    } catch (e) {
      errors.push({ chainId, error: String(e).slice(0, 300) });
      console.error(`chain ${chainId} FAILED:`, e.message);
      if (prev?.chains?.[chainId]) {
        chains[chainId] = { ...prev.chains[chainId], stale: true, staleSince: prev.generatedAt };
      }
    }
  }
  // Union task map: the activity feed is platform-wide, so swarm titles must
  // resolve against tasks from both chains.
  const allTasksById = new Map();
  for (const id of CHAINS) for (const t of raw[id]?.tasks || []) allTasksById.set(t.id, t);
  for (const chainId of CHAINS) {
    if (raw[chainId]) chains[chainId] = derive(chainId, raw[chainId].c, raw[chainId].tasks, raw[chainId].feed, allTasksById);
  }
  if (!Object.keys(chains).length) {
    console.error("FATAL: no chain data at all — refusing to write an empty dashboard.");
    process.exit(1);
  }
  const doc = {
    generatedAt,
    sources: {
      base: "https://api.taskmarket.dev",
      endpoints: [
        "/api/market/stats?chainId=…",
        "/api/stats/breakdowns?chainId=…",
        "/api/stats/platform-time-series?chainId=…&range=7d|30d|90d|all&bucket=day|week",
        "/api/stats/activity-heatmap?chainId=…&range=30d&dimension=hourOfWeek|mode",
        "/api/stats/activity-feed?chainId=…&limit=50",
        "/api/tasks?chainId=…&sort=newest&limit=100 (paginated)",
      ],
      units: "Money is in micro units in the API: 1,000,000 micro = 1 OUSD (Tempo) / 1 USDC (Base).",
      notes: [
        "Headline numbers are shown exactly as the API reports them for the data-as-of time.",
        "The API reports platform-wide figures for time-series, breakdowns, heatmap and activity-feed: the values are identical for chainId 4217 and 8453. Per-chain figures are paidWorkers, activeWallets, the task list, open escrow and poster stats.",
        "Poster display names are shown only when the API itself provides them; otherwise a truncated wallet address is shown. No names are guessed.",
        "Distinct posters per week and top-poster shares are computed from the /api/tasks list (newest first, up to 56 days back).",
        "Median time to decision is computed from activity-feed completion events joined to task creation times; shown only when at least 3 completions were observed.",
        "The 7d time-series range covers 8 day buckets including the current (partial) day; 7d totals sum exactly the buckets the API reports for range=7d.",
      ],
    },
    chains,
    errors,
  };
  const tmp = `${OUT}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 1));
  renameSync(tmp, OUT);
  writeFileSync(LOG, JSON.stringify({ generatedAt, log, errors }, null, 1));
  console.log(`wrote ${OUT} (${(JSON.stringify(doc).length / 1024).toFixed(0)} KB) errors=${errors.length}`);
  for (const id of CHAINS) {
    const h = chains[id]?.headline;
    if (h) console.log(` chain ${id}: open=${h.openTasks} active7d=${h.activeAgents7d} putUp7d=${h.rewardsPutUp7d} paid7d=${h.rewardsPaid7d} tasks=${chains[id].tasksFetched}`);
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
