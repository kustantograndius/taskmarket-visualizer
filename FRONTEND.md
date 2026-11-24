# Taskmarket Live Market Visualizer — frontend notes

Static dashboard. One page, no framework, no external requests.

- `public/index.html` — shell, header (lockup top-left), nav, all 7 view sections, footer.
- `public/app.js` — renders every view from `data/dashboard.json`. Hand-rolled SVG charts. No dependencies.
- `public/styles.css` — brand tokens, mobile-first (single column under 640px, tap targets ≥ 44px).
- `public/data/dashboard.json` — minified copy of `data/dashboard.json` (131,343 bytes; verified byte-identical data via JSON equality).

## Assets

All canonical assets were present at build time:

- Fonts: `public/fonts/*.woff2` (Instrument Serif regular + italic, Inter Tight variable, Departure Mono) — preloaded, `font-display: swap`.
- `public/img/taskmarket-lockup.png` — used as-is, top-left, once per page (persistent header).
- `public/img/plate-converge-landscape.jpg` (23,098 bytes) — hero background.
- `public/og.png`, `og-flow.png`, `og-market.png`, `og-posters.png` — present; `og.png` referenced as the social image. The per-view OG files are not referenced by the page (they belong to the share-card step); wire them in if per-view cards are wanted.
- `public/img/taskmarket-mark.png` — present, used only as the favicon.

Deliberate omission: `public/img/character-agent-sheet.png` (1,729,444 bytes) is **not** loaded by the page. Including it would break the 500 KB page-weight budget on its own. The mascot may appear in at most one view, but at this file size it cannot ship inside the budget — it needs a compressed export from the asset step before use.

## Views — simplifications

None material. Two judgement calls:

- Market chart shows one metric at a time (tabs: Active agents / Tasks created / Rewards put up / Rewards paid) instead of four overlaid series, so the scale stays honest — counts and money share no axis. Range totals for the selected range sit under the chart.
- The mode heatmap's columns are dates (30 days, 2026-10-25 → 2026-11-24); every 5th date is labelled. The hour-of-week heatmap is a full 7×24 grid; cells with no events render at the floor tint.

## Deep links

`?view=overview|market|flow|posters|heatmap|feed|methods`, `?chain=4217|8453`, `?range=7d|30d|90d|all` (range only on Market). Every view has a "Share this view" button (copies the deep link) and a "Post on X" link (X intent, plain copy). The chain toggle re-renders all per-chain numbers; platform-wide series are labelled wherever they appear.

## Self-check results (2026-11-25 ~02:30 WIB)

1. **Must-show items:** all present (verified by grep): Data as of, Share this view, Post on X, Where the money flows, The swarm, Distinct posters per week, Top 10 posters, Hour of week, By mode per day, Latest activity, Endpoints used, the exact median null sentence, footer lines, `taskmarket.dev`, the exact platform-wide sentence, `npm i -g @lucid-agents/taskmarket`.
2. **Five numbers, rendered vs data (app.js executed in Node against the real minified data file):**
   - Open tasks 96; active agents 7d 473 — match `chains.4217.headline`.
   - Rewards put up 7d 941.43 OUSD (941,430,000 micro) — match.
   - Rewards paid 7d 551.19 OUSD (551,188,500 micro) — match.
   - Settlements 7d 1,104 — match.
   - Top poster HoloBeaconMonk, 32 tasks, 508.00 OUSD, 37.1% — match.
   - Cross-checks: 7d series totals sum to 594 tasks / 941.43 put up / 551.19 paid / 1,104 settlements, equal to the headline. Base chain verified separately: escrow 14.06 USDC, 470 workers paid, 3,524 active wallets, top poster FluxWakeDancer 25.19 USDC, 2.6%, top-5 9.3%.
3. **External URLs:** two, both intended. (a) `https://x.com/intent/post?text=…` in `app.js` — the required X share link. (b) `http://localhost:8130` in `index.html` Methods — the local serve command from the README, not a fetched resource. No CDNs, no Google Fonts, no other `http(s)://` in HTML/CSS/JS. `https://api.taskmarket.dev` appears only as rendered text from `data.sources`.
4. **Banned words:** none of revolutionary / game-changing / 10x / passive income / guaranteed / profit / investment / moon / airdrop / future of work / "AI will replace" / earn while you sleep / get rich / insane / token launch / price prediction in any built file. The word "returns" appears 3×, only inside the task-mandated exact sentence "Platform-wide — the API returns the same series for both chains" (Market note, Heatmap note, Methods). The poster-name policy was reworded to avoid the word elsewhere.
5. **No wallet-connect code, no analytics, no third-party logos.** The word "wallet" appears only in data labels ("active wallets", "truncated wallet address", "no wallet" in the hosting note). No `ethers`/`web3`/tracking code.
6. **Sizes:** `public/` on disk is 2,526,523 bytes, dominated by files the page never loads (mascot 1,729,444 bytes; four OG images ~428 KB; mark.png). **Actual page weight (HTML+CSS+JS+data+fonts+plate+lockup) = 318,870 bytes — under the 500 KB budget.** Breakdown: index.html 11,712; app.js 26,318; styles.css 13,842; data.json minified 131,343; fonts 82,140; plate 23,098; lockup 30,419.
   - `node --check public/app.js`: OK.
   - Served locally (`python3 -m http.server 8130 --directory public`): index/app.js/styles.css/data all HTTP 200.

## Open items / placeholders (for the parent agent)

- `package.json` references `node scripts/build.mjs`, which does not exist yet. The minified `public/data/dashboard.json` was produced directly (`python3 -c json.dumps(..., separators=(',',':'))`); the build script, when written, should fold this step in so the hourly refresh regenerates the public copy.
- README placeholders `<!-- REPO_URL -->` / `<!-- LIVE_URL -->` are carried into Methods verbatim as placeholders.
- `og:image` in `index.html` is relative (`og.png`); fill in the absolute live URL at deploy time.
- Nothing was submitted to Taskmarket. $0 spent.
