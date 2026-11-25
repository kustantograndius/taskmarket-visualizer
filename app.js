/* Taskmarket Live Market Visualizer — app.
   Single source of numbers: data/dashboard.json (public copy, minified).
   No external requests. No analytics. No wallet code. Charts are hand-rolled SVG. */
(function () {
  "use strict";

  var VIEWS = ["overview", "market", "flow", "posters", "heatmap", "feed", "methods"];
  var RANGES = ["7d", "30d", "90d", "all"];
  var CHAINS = { "4217": { name: "Tempo", currency: "OUSD" }, "8453": { name: "Base", currency: "USDC" } };
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var METRICS = [
    { key: "activeAgents", label: "Active agents", money: false },
    { key: "tasksCreated", label: "Tasks created", money: false },
    { key: "rewardVolume", label: "Rewards put up", money: true },
    { key: "paidVolume", label: "Rewards paid", money: true }
  ];

  var state = { view: "overview", chain: "4217", range: "7d", metric: "activeAgents" };
  var DATA = null;

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtInt(n) { return Number(n).toLocaleString("en-US"); }
  function fmtMoney(micro, chain) {
    if (micro == null) return "—";
    var v = Number(micro) / 1000000;
    return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + CHAINS[chain].currency;
  }
  function fmtMoneyShort(micro, chain) {
    if (micro == null) return "—";
    var v = Number(micro) / 1000000;
    return v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " " + CHAINS[chain].currency;
  }
  function fmtPct(n) { return (n == null ? "—" : Number(n).toLocaleString("en-US") + "%"); }
  function fmtSignedPct(n) { return (n == null ? "—" : (n > 0 ? "+" : "") + Number(n).toLocaleString("en-US") + "%"); }
  function truncAddr(a) { return a ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
  function fmtAsOf(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return "Data as of " + d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear() +
      ", " + String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0") + " UTC";
  }
  function fmtDateShort(iso) {
    var d = new Date(iso + "T00:00:00Z");
    if (isNaN(d)) return iso;
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
  }
  function relTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff) || diff < 0) diff = 0;
    var m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    var d = Math.floor(h / 24);
    return d + "d ago";
  }
  function chainData() { return DATA.chains[state.chain]; }
  function cur() { return CHAINS[state.chain].currency; }

  function deepLink() {
    var q = "?view=" + state.view + "&chain=" + state.chain;
    if (state.view === "market") q += "&range=" + state.range;
    return location.origin + location.pathname + q;
  }

  /* ---------- state from URL ---------- */
  function readState() {
    var p = new URLSearchParams(location.search);
    if (VIEWS.indexOf(p.get("view")) !== -1) state.view = p.get("view");
    if (CHAINS[p.get("chain")]) state.chain = p.get("chain");
    if (RANGES.indexOf(p.get("range")) !== -1) state.range = p.get("range");
  }
  function pushState() {
    var q = "?view=" + state.view + "&chain=" + state.chain;
    if (state.view === "market") q += "&range=" + state.range;
    history.pushState(null, "", q);
  }

  /* ---------- shared chrome ---------- */
  function renderChrome() {
    var asof = fmtAsOf(DATA.generatedAt);
    $("#data-asof").textContent = asof;
    var ov = $("#asof-overview"); if (ov) ov.textContent = asof;
    $all("#main-nav a").forEach(function (a) {
      if (a.getAttribute("data-view") === state.view) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    $all("section.view").forEach(function (s) { s.classList.toggle("active", s.id === "view-" + state.view); });
    renderChainSegs();
    renderShareRows();
  }

  function renderChainSegs() {
    $all("[id^='chain-seg-']").forEach(function (box) {
      box.innerHTML = Object.keys(CHAINS).map(function (cid) {
        var c = CHAINS[cid];
        return '<button type="button" data-chain="' + cid + '" aria-pressed="' + (state.chain === cid) + '">' +
          esc(c.name) + " (" + cid + ")" + "</button>";
      }).join("");
    });
    var note = $("#chain-note-overview");
    if (note) note.textContent = state.chain === "4217" ? "Rewards in OUSD" : "Rewards in USDC";
  }

  function renderShareRows() {
    $all("[data-share]").forEach(function (box) {
      var url = deepLink();
      var text = "Taskmarket live market — " + state.view + " (" + CHAINS[state.chain].name + "): " + url;
      var x = "https://x.com/intent/post?text=" + encodeURIComponent(text);
      box.innerHTML =
        '<button type="button" data-copy="' + esc(url) + '">Share this view</button>' +
        '<a href="' + esc(x) + '" target="_blank" rel="noopener">Post on X</a>' +
        '<span class="copied" hidden>Link copied.</span>';
    });
  }

  /* ---------- overview ---------- */
  function renderOverview() {
    var c = chainData(), h = c.headline, f = c.flow;
    var tiles = [
      { n: fmtInt(h.openTasks), cap: "Open tasks" },
      { n: fmtInt(h.activeAgents7d), cap: "Active agents, 7 days" },
      { n: fmtMoney(h.rewardsPutUp7d, state.chain), cap: "Rewards put up, 7 days" },
      { n: fmtMoney(h.rewardsPaid7d, state.chain), cap: "Rewards paid, 7 days" },
      { n: fmtInt(h.settlements7d), cap: "Settlements, 7 days" }
    ];
    $("#headline-tiles").innerHTML = tiles.map(function (t) {
      return '<div class="tile"><div class="num">' + esc(t.n) + '</div><div class="cap">' + esc(t.cap) + "</div></div>";
    }).join("");

    $("#flow-strip").innerHTML =
      "<span>" + esc(fmtMoney(f.putUp7d, state.chain)) + " put up, 7 days</span><span class='sep'>&middot;</span>" +
      "<span>" + esc(fmtMoney(f.paid7d, state.chain)) + " paid, 7 days</span><span class='sep'>&middot;</span>" +
      "<span>" + esc(fmtMoney(f.openEscrowMicro, state.chain)) + " in escrow now</span>" +
      "<span class='muted'>&middot; " + fmtInt(f.settlements7d) + " settlements</span>";

    var other = state.chain === "4217" ? DATA.chains["8453"] : DATA.chains["4217"];
    $("#insight-callouts").innerHTML =
      '<div class="callout"><div class="big">' + fmtPct(c.top5SharePct) + ' vs ' + fmtPct(other.top5SharePct) + '</div>' +
      "<p><b>Top-5 posters hold " + fmtPct(c.top5SharePct) + " of 30-day volume on " + esc(CHAINS[state.chain].name) +
      ", against " + fmtPct(other.top5SharePct) + " on " + esc(CHAINS[other.chainId || (state.chain === "4217" ? "8453" : "4217")].name) +
      ".</b> One chain is concentrated. The other is spread out.</p></div>" +
      '<div class="callout"><div class="big">' + fmtSignedPct(c.growth.tasksCreatedChangePct) + '</div>' +
      "<p><b>Tasks created, this 7 days vs the previous 7 days.</b> Active agents " + fmtSignedPct(c.growth.activeAgentsChangePct) + " over the same span.</p></div>" +
      '<div class="callout"><div class="big">' + fmtPct(c.died.diedPct) + '</div>' +
      "<p><b>Of " + fmtInt(c.died.total) + " tasks, " + fmtInt(c.died.expired + c.died.cancelled) +
      " ended expired or cancelled.</b> " + fmtInt(c.died.completed) + " completed.</p></div>";

    $("#also-line").innerHTML =
      fmtInt(h.tasksCreated7d) + " tasks created &middot; " + fmtInt(h.completedTasks7d) + " completed &middot; " +
      fmtInt(h.newAgents7d) + " new agents &middot; " + fmtInt(h.paidWorkers) + " workers paid &middot; " +
      fmtInt(h.activeWallets) + " active wallets &middot; " + fmtInt(h.registeredWorkers) + " registered workers.";
    $("#median-line").innerHTML = medianText(c);
  }

  function medianText(c) {
    if (c.medianHoursToDecision == null) {
      return "Median time to decision: <b>Not enough completions observed in the last 48h</b> (" + fmtInt(c.decisionsSampled) + " sampled).";
    }
    return "Median time to decision: <b>" + esc(String(c.medianHoursToDecision)) + " hours</b> (" + fmtInt(c.decisionsSampled) + " sampled).";
  }

  /* ---------- market ---------- */
  function renderMarket() {
    var c = chainData();
    $("#range-seg").innerHTML = RANGES.map(function (r) {
      return '<button type="button" data-range="' + r + '" aria-pressed="' + (state.range === r) + '">' + r + "</button>";
    }).join("");
    $("#metric-tabs").innerHTML = METRICS.map(function (m) {
      return '<button type="button" data-metric="' + m.key + '" aria-pressed="' + (state.metric === m.key) + '">' + esc(m.label) + "</button>";
    }).join("");

    var series = c.timeSeries[state.range] || [];
    var metric = METRICS.filter(function (m) { return m.key === state.metric; })[0];
    $("#metric-legend-label").textContent = metric.label + " — " + state.range;
    renderAreaChart($("#market-chart"), series, metric);
    var tot = rangeTotals(series);
    $("#range-total-label").textContent =
      "Totals for " + state.range + ": " + fmtInt(tot.tasks) + " tasks created · " +
      fmtMoney(tot.putUp, state.chain) + " put up · " + fmtMoney(tot.paid, state.chain) + " paid · " +
      fmtInt(tot.settlements) + " settlements";

    renderBars($("#mode-bars"), c.breakdowns.mode, "mode");
    renderBars($("#status-bars"), c.breakdowns.status, "status");

    $("#growth-callouts").innerHTML =
      '<div class="callout"><div class="big">' + fmtSignedPct(c.growth.tasksCreatedChangePct) + '</div><p><b>Tasks created vs the previous 7 days.</b></p></div>' +
      '<div class="callout"><div class="big">' + fmtSignedPct(c.growth.activeAgentsChangePct) + '</div><p><b>Active agents vs the previous 7 days.</b></p></div>' +
      '<div class="callout"><div class="big">' + fmtInt(c.headline.tasksCreated7d) + '</div><p><b>Tasks created in the last 7 days.</b> ' + fmtInt(c.headline.completedTasks7d) + ' completed in the same span.</p></div>';
    var at = c.breakdowns.actorType || [];
    var ag = (at.filter(function (a) { return a.actorType === "agent"; })[0] || {}).count || 0;
    var hu = (at.filter(function (a) { return a.actorType === "human"; })[0] || {}).count || 0;
    $("#actor-line").textContent = "Activity events in the breakdown: " + fmtInt(ag) + " agent, " + fmtInt(hu) + " human.";
  }

  function rangeTotals(series) {
    var t = { tasks: 0, putUp: 0, paid: 0, settlements: 0 };
    series.forEach(function (p) {
      t.tasks += p.tasksCreated || 0;
      t.putUp += Number(p.rewardVolume || 0);
      t.paid += Number(p.paidVolume || 0);
      t.settlements += p.settlements || 0;
    });
    return t;
  }

  function metricValue(p, metric) {
    var v = p[metric.key];
    return metric.money ? Number(v || 0) / 1000000 : Number(v || 0);
  }

  function renderAreaChart(box, series, metric) {
    if (!series.length) { box.innerHTML = "<p class='muted'>No data for this range.</p>"; return; }
    var W = 720, H = 260, PL = 52, PR = 12, PT = 14, PB = 28;
    var vals = series.map(function (p) { return metricValue(p, metric); });
    var max = Math.max.apply(null, vals.concat([1]));
    var x = function (i) { return PL + (i * (W - PL - PR)) / Math.max(series.length - 1, 1); };
    var y = function (v) { return PT + (1 - v / max) * (H - PT - PB); };
    var line = series.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(metricValue(p, metric)).toFixed(1); }).join(" ");
    var area = line + " L" + x(series.length - 1).toFixed(1) + " " + (H - PB) + " L" + x(0).toFixed(1) + " " + (H - PB) + " Z";
    var grid = [0, 0.5, 1].map(function (f) {
      var gy = PT + (1 - f) * (H - PT - PB);
      var lab = metric.money
        ? (max * f).toLocaleString("en-US", { maximumFractionDigits: 0 }) + " " + cur()
        : Math.round(max * f).toLocaleString("en-US");
      return '<line class="grid" x1="' + PL + '" y1="' + gy + '" x2="' + (W - PR) + '" y2="' + gy + '"/>' +
        '<text class="axis" x="' + (PL - 6) + '" y="' + (gy + 3) + '" text-anchor="end">' + esc(lab) + "</text>";
    }).join("");
    var step = Math.max(1, Math.ceil(series.length / 6));
    var xlabels = series.map(function (p, i) {
      if (i % step !== 0 && i !== series.length - 1) return "";
      var lab = p.bucket.length === 10 ? p.bucket.slice(5) : p.bucket;
      var anchor = i === 0 ? "start" : (i === series.length - 1 ? "end" : "middle");
      return '<text class="axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="' + anchor + '">' + esc(lab) + "</text>";
    }).join("");
    var dots = series.map(function (p, i) {
      return '<circle class="dot" cx="' + x(i).toFixed(1) + '" cy="' + y(metricValue(p, metric)).toFixed(1) + '" r="3"><title>' +
        esc(p.bucket) + ": " + esc(fmtChartVal(metricValue(p, metric), metric)) + "</title></circle>";
    }).join("");
    box.innerHTML =
      '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(metric.label) + " chart, " + esc(state.range) + '">' +
      grid + '<path class="area" d="' + area + '"/><path class="line" d="' + line + '"/>' + dots + xlabels + "</svg>";
  }

  function fmtChartVal(v, metric) {
    return metric.money
      ? v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + cur()
      : fmtInt(Math.round(v));
  }

  function renderBars(box, items, keyField) {
    if (!items || !items.length) { box.innerHTML = "<p class='muted'>No data.</p>"; return; }
    var sorted = items.slice().sort(function (a, b) { return b.count - a.count; });
    var total = sorted.reduce(function (s, it) { return s + it.count; }, 0);
    var max = sorted[0].count;
    box.innerHTML = sorted.map(function (it) {
      var label = it[keyField];
      var pct = total ? (100 * it.count / total) : 0;
      return '<div class="bar-row"><span class="bar-label">' + esc(label) + '</span>' +
        '<span class="bar-track"><span class="bar-fill' + (sorted.indexOf(it) === 0 ? " hot" : "") +
        '" style="display:block;width:' + Math.max(1, 100 * it.count / max).toFixed(1) + '%"></span></span>' +
        '<span class="bar-count">' + fmtInt(it.count) + ' <span class="pct">' + pct.toFixed(1) + '%</span></span></div>';
    }).join("");
  }

  /* ---------- flow ---------- */
  function renderFlow() {
    var c = chainData(), f = c.flow;
    $("#flow-diagram").innerHTML =
      '<div class="flow-node"><div class="step">Posted &middot; last 7 days</div><div class="amount">' + esc(fmtMoney(f.putUp7d, state.chain)) + '</div><div class="sub">Rewards put up in the last 7 days</div></div>' +
      '<div class="flow-arrow" aria-hidden="true">&middot;</div>' +
      '<div class="flow-node"><div class="step">In escrow &middot; right now</div><div class="amount">' + esc(fmtMoney(f.openEscrowMicro, state.chain)) + '</div><div class="sub">Held now, across ' + fmtInt(f.openEscrowTasks) + ' open tasks</div></div>' +
      '<div class="flow-arrow" aria-hidden="true">&middot;</div>' +
      '<div class="flow-node paid"><div class="step">Paid &middot; last 7 days</div><div class="amount">' + esc(fmtMoney(f.paid7d, state.chain)) + '</div><div class="sub">Released in ' + fmtInt(f.settlements7d) + ' settlements, last 7 days</div></div>';
    var q = c.decisionQueue;
    $("#queue-line").textContent =
      fmtInt(q.pendingApproval) + " waiting for approval · " + fmtInt(q.workerSelected) + " worker selected · " +
      fmtInt(q.claimed) + " claimed.";
    $("#median-line-flow").innerHTML = medianText(c);
    var d = c.died;
    $("#died-line").innerHTML =
      "<b>" + fmtPct(d.diedPct) + "</b> of tasks died: " + fmtInt(d.expired) + " expired and " + fmtInt(d.cancelled) +
      " cancelled, out of " + fmtInt(d.total) + " total. " + fmtInt(d.completed) + " completed.";
    var swarm = c.swarm || [];
    $("#swarm-list").innerHTML = swarm.length ? swarm.map(function (s, i) {
      return '<li><span class="rank">' + (i + 1) + '</span><div><div class="title">' + esc(s.title || "(no title)") +
        ' <span class="chip ' + esc(s.status || "") + '">' + esc(s.status || "") + '</span></div>' +
        '<div class="meta">' + esc(s.referenceCode || "") + " &middot; " + esc(s.taskId ? truncAddr(s.taskId) : "") + "</div></div>" +
        '<div class="subs"><b>' + fmtInt(s.submissions) + '</b><span>submissions</span><span>' + esc(fmtMoneyShort(s.reward, state.chain)) + "</span></div></li>";
    }).join("") : "<li>No swarm tasks in the last 48 hours.</li>";
  }

  /* ---------- posters ---------- */
  function renderPosters() {
    var c = chainData();
    var weeks = c.postersPerWeek || [];
    var W = 720, H = 240, PL = 36, PB = 30, PT = 26;
    var max = Math.max.apply(null, weeks.map(function (w) { return w.distinct; }).concat([1]));
    var bw = weeks.length ? (W - PL - 20) / weeks.length : 0;
    var bars = weeks.map(function (w, i) {
      var bh = (w.distinct / max) * (H - PT - PB);
      var bx = PL + i * bw + 6;
      var by = H - PB - bh;
      return '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + Math.max(8, bw - 12).toFixed(1) +
        '" height="' + Math.max(2, bh).toFixed(1) + '" rx="3" fill="#E74079"><title>Week of ' + esc(w.week) + ": " + w.distinct + " distinct posters</title></rect>" +
        '<text class="axis" x="' + (bx + (bw - 12) / 2).toFixed(1) + '" y="' + (by - 5).toFixed(1) + '" text-anchor="middle" fill="#FFF6E8">' + w.distinct + "</text>" +
        '<text class="axis" x="' + (bx + (bw - 12) / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(w.week.slice(5)) + "</text>";
    }).join("");
    $("#posters-chart").innerHTML = weeks.length
      ? '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Distinct posters per week">' + bars + "</svg>"
      : "<p class='muted'>No poster data.</p>";

    var other = state.chain === "4217" ? DATA.chains["8453"] : DATA.chains["4217"];
    var otherId = state.chain === "4217" ? "8453" : "4217";
    $("#concentration-callouts").innerHTML =
      '<div class="callout"><div class="big">' + fmtPct(c.top5SharePct) + '</div><p><b>Top-5 share of 30-day volume on ' + esc(CHAINS[state.chain].name) +
      '.</b> Top poster: ' + esc(topName(c)) + " at " + fmtPct(c.topPosters[0] ? c.topPosters[0].sharePct : null) + ".</p></div>" +
      '<div class="callout"><div class="big">' + fmtPct(other.top5SharePct) + '</div><p><b>Top-5 share on ' + esc(CHAINS[otherId].name) +
      ".</b> The two chains read very differently: concentrated here, spread out there.</p></div>" +
      '<div class="callout"><div class="big">' + fmtInt(c.posters30d) + '</div><p><b>Distinct posters in the last 30 days on ' + esc(CHAINS[state.chain].name) +
      ".</b> " + fmtInt(other.posters30d) + " on " + esc(CHAINS[otherId].name) + ".</p></div>";

    $("#posters-table").innerHTML = (c.topPosters || []).map(function (p, i) {
      var name = p.displayName ? esc(p.displayName) : '<span class="addr">' + esc(truncAddr(p.requester)) + "</span>";
      return '<tr' + (i === 0 ? ' class="top1"' : "") + '><td class="num">' + (i + 1) + "</td><td>" + name +
        '<br><span class="addr muted">' + esc(truncAddr(p.requester)) + "</span></td>" +
        '<td class="num">' + fmtInt(p.tasks) + '</td><td class="num">' + esc(fmtMoney(p.volume, state.chain)) +
        '</td><td class="num">' + fmtPct(p.sharePct) + "</td></tr>";
    }).join("");
  }

  function topName(c) {
    if (!c.topPosters || !c.topPosters.length) return "—";
    return c.topPosters[0].displayName || truncAddr(c.topPosters[0].requester);
  }

  /* ---------- heatmap ---------- */
  function renderHeatmap() {
    var c = chainData();
    var hm = c.heatmapHourOfWeek || { rowKeys: [], colKeys: [], cells: [], maxCount: 1 };
    var max = hm.maxCount || 1;
    var cellMap = {};
    (hm.cells || []).forEach(function (cell) { cellMap[cell.row + ":" + cell.col] = cell.count; });
    var peak = (hm.cells || []).reduce(function (best, cell) {
      return (!best || cell.count > best.count) ? cell : best;
    }, null);
    var html = '<div class="corner"></div>';
    hm.colKeys.forEach(function (col) { html += '<div class="col-label">' + esc(col) + "</div>"; });
    hm.rowKeys.forEach(function (row) {
      html += '<div class="row-label">' + esc(DAYS[Number(row)] || row) + "</div>";
      hm.colKeys.forEach(function (col) {
        var count = cellMap[row + ":" + col] || 0;
        var a = count ? 0.06 + 0.94 * (count / max) : 0.06;
        html += '<div class="cell" title="' + esc(DAYS[Number(row)]) + " " + esc(col) + ':00 UTC — ' + fmtInt(count) +
          ' events" style="background:rgba(231,64,121,' + a.toFixed(2) + ')"></div>';
      });
    });
    $("#heatmap-hour").innerHTML = html;
    $("#heatmap-peak").textContent = peak
      ? "Busiest: " + DAYS[Number(peak.row)] + " " + peak.col + ":00 UTC — " + fmtInt(peak.count) + " events."
      : "";

    var mm = c.heatmapMode || { rowKeys: [], colKeys: [], cells: [], maxCount: 1 };
    var mmax = mm.maxCount || 1;
    var mmap = {};
    (mm.cells || []).forEach(function (cell) { mmap[cell.row + ":" + cell.col] = cell.count; });
    var mhtml = '<div class="corner"></div>';
    mm.colKeys.forEach(function (col, i) {
      // Day number only: the columns are ~28px wide, "MM-DD" wraps.
      mhtml += '<div class="col-label">' + (i % 5 === 0 ? esc(col.slice(8)) : "") + "</div>";
    });
    mm.rowKeys.forEach(function (row) {
      mhtml += '<div class="row-label">' + esc(row) + "</div>";
      mm.colKeys.forEach(function (col) {
        var count = mmap[row + ":" + col] || 0;
        var a = count ? 0.06 + 0.94 * (count / mmax) : 0.06;
        mhtml += '<div class="cell" title="' + esc(row) + " · " + esc(col) + " — " + fmtInt(count) +
          ' events" style="background:rgba(231,64,121,' + a.toFixed(2) + ')"></div>';
      });
    });
    var modeEl = $("#heatmap-mode");
    modeEl.innerHTML = mhtml;
    // Column count must match the data: the 30d range covers 31 day buckets
    // (inclusive endpoints), not 30 — a hardcoded repeat(30, …) wraps the
    // last cell of every row into the next row.
    modeEl.style.gridTemplateColumns = "92px repeat(" + mm.colKeys.length + ", minmax(0, 1fr))";
    $("#heatmap-hour").style.gridTemplateColumns = "44px repeat(" + hm.colKeys.length + ", minmax(0, 1fr))";
    if (mm.colKeys.length >= 2) {
      $("#heatmap-mode-note").textContent =
        "Each column is one day, " + fmtDateShort(mm.colKeys[0]) + " – " + fmtDateShort(mm.colKeys[mm.colKeys.length - 1]) +
        ". Bounty carries the days; the other modes are thin throughout.";
    }
  }

  /* ---------- feed ---------- */
  function renderFeed() {
    var c = chainData();
    var feed = c.feed || [];
    var labels = { task_submitted: "Submitted", task_created: "Task posted", task_completed: "Completed", task_rated: "Rated" };
    $("#feed-list").innerHTML = feed.length ? feed.map(function (e) {
      var label = labels[e.type] || e.type.replace(/_/g, " ");
      var actor = e.actorShort ? esc(e.actorShort) : "—";
      if (e.actorAgentId) actor += " · agent #" + esc(String(e.actorAgentId));
      actor += " · " + esc(e.actorType || "");
      var amt = e.amount != null ? ' <span class="famt">' + esc(fmtMoney(e.amount, state.chain)) + "</span>" : "";
      var rating = e.rating != null ? " · rating " + esc(String(e.rating)) : "";
      return '<li><span class="when">' + esc(relTime(e.timestamp)) + '</span><div>' +
        '<div class="etype">' + esc(label) + amt + "</div>" +
        '<div class="ftitle">' + esc(e.taskTitle || "(no title)") + "</div>" +
        '<div class="fmeta">' + actor + rating + " &middot; " + esc(e.taskId ? truncAddr(e.taskId) : "") + "</div></div></li>";
    }).join("") : "<li>No feed events.</li>";
    $("#feed-note").textContent = "Showing the " + fmtInt(feed.length) +
      " newest events. Tasks scanned: " + fmtInt(c.tasksFetched) + " · feed events fetched: " + fmtInt(c.feedFetched) + ".";
  }

  /* ---------- methods ---------- */
  function renderMethods() {
    var s = DATA.sources;
    $("#methods-base").textContent = s.base;
    $("#methods-endpoints").innerHTML = s.endpoints.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("");
    $("#methods-units").textContent = s.units;
    $("#methods-notes").innerHTML = s.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
    $("#methods-counts").textContent =
      "Tasks scanned: " + fmtInt(DATA.chains["4217"].tasksFetched) + " (Tempo) · " +
      fmtInt(DATA.chains["8453"].tasksFetched) + " (Base). Feed events fetched: " +
      fmtInt(DATA.chains["4217"].feedFetched) + " per chain.";
  }

  /* ---------- render all ---------- */
  function renderAll() {
    renderChrome();
    renderOverview();
    renderMarket();
    renderFlow();
    renderPosters();
    renderHeatmap();
    renderFeed();
    renderMethods();
  }

  /* ---------- events (delegation) ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("a, button");
    if (!t) return;
    if (t.hasAttribute("data-view")) {
      ev.preventDefault();
      state.view = t.getAttribute("data-view");
      pushState();
      renderAll();
      window.scrollTo(0, 0);
      return;
    }
    if (t.hasAttribute("data-chain")) {
      state.chain = t.getAttribute("data-chain");
      pushState();
      renderAll();
      return;
    }
    if (t.hasAttribute("data-range")) {
      state.range = t.getAttribute("data-range");
      pushState();
      renderAll();
      return;
    }
    if (t.hasAttribute("data-metric")) {
      state.metric = t.getAttribute("data-metric");
      renderMarket();
      return;
    }
    if (t.hasAttribute("data-copy")) {
      var url = t.getAttribute("data-copy");
      var done = function () {
        var note = t.parentElement.querySelector(".copied");
        if (note) note.hidden = false;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
      } else { fallbackCopy(url); done(); }
    }
  });

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
  }

  window.addEventListener("popstate", function () { readState(); renderAll(); });

  /* ---------- boot ---------- */
  readState();
  fetch("data/dashboard.json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) { DATA = d; renderAll(); })
    .catch(function () { $("#load-error").hidden = false; });
})();
