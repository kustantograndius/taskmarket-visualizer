# Integration & QA log — Taskmarket Live Market Visualizer

## Integration fixes (applied by the coordinator after the two child builds)

1. **"returns" wording removed** — the brand kit bans the word "returns"
   (financial sense). Reworded 3× in `public/index.html`, 4× in
   `scripts/fetch.mjs` notes, 1× in `public/app.js` (comment) to
   "reports" / "provides" / "covers". `scripts/verify.mjs` now also bans
   "returns" and "profit" in shipped files, so the check is strict.
2. **Mascot removed from `public/`** — `public/img/character-agent-sheet.png`
   (1.73 MB) was unused by the page and broke the weight budget. It stays in
   `brand-kit/` (source). The page loads no mascot.
3. **Flow-diagram honesty fix** — the 1→2→3 arrows implied
   put-up − paid = in-escrow, which is false (7-day window sums vs a
   point-in-time escrow figure). Step labels now carry the window
   ("Posted · last 7 days", "In escrow · right now", "Paid · last 7 days"),
   arrows replaced by middots. Same fix in the overview flow strip
   ("put up, 7 days · paid, 7 days · in escrow now").
4. **Market chart x-axis** — the last date label was clipped at the right
   edge. First label now anchors "start", last anchors "end".
5. **Heatmap subtitle** — said "Darker means more events" while the legend
   shows brighter = more. Corrected to "Brighter means more events."
6. **Mode-heatmap grid off-by-one (real bug, found in QA)** — the 30d range
   returns **31 day buckets** (inclusive endpoints), but the CSS hardcoded
   `repeat(30, 1fr)`, so the last cell of every row wrapped into the next
   row: the max-count bounty cell (134 events) landed as a giant block in
   the label column and every row-label shifted one column right. Fixed by
   setting `gridTemplateColumns` from `colKeys.length` in JS (both grids),
   day-number-only column labels, and a caption with the real date range
   ("25 Oct – 24 Nov"). Also changed bare `1fr` to `minmax(0, 1fr)` so
   aspect-ratio cells can't blow the track width up (that bug made the
   pre-fix grid 2,852 px wide).
7. **Localhost URL removed from Methods copy** — the serve command is now
   quoted as `npm run serve` with no literal URL, so the external-URL check
   stays clean. The only outbound URL in shipped code is the X share
   intent (`https://x.com/intent/post`), whitelisted in verify as a
   user-initiated navigation, not a loaded resource.

## QA results (final run, 2026-11-24 ~19:50 UTC, data as of 19:47:40Z)

- `node scripts/build.mjs` — OK (fetch → OG cards → minified public data).
- `node scripts/verify.mjs` — **0 failures, 1 warning**. Warning: openTasks
  shipped 91 vs live 90 — live drift in the minutes between build and
  verify; the "Data as of" stamp covers it (the spec judges numbers per
  data-as-of).
- Spot-check vs live API at verify time: openTasks 91→90 (drift),
  activeAgents7d 473 ✓, paidWorkers 158 ✓, registeredWorkers 148,418 ✓,
  activeWallets 930 ✓.
- Page-load weight 347 KB (budget 500 KB). All 8 views load in
  ~1.15–1.27 s on localhost (desktop + mobile), no horizontal overflow.
- Screenshots (desktop + mobile, all 7 views) in `.qa/` — full-res PNGs
  plus `-small.png` downscaled copies. Visually checked: overview,
  market, flow, posters, heatmap (both grids), feed, methods.

## Competitor alert (2026-11-24 ~19:50 UTC)

Our target task **TSK-BRK611AN now has 14 submissions** (was 0 at
detection 01:53 WIB). Two submissions appeared in the live feed ~14 min
before the check. Top-3 split (35/10/5 OUSD) now applies; the
single-qualifier-takes-all-50 case is gone. Submit as soon as the site is
live — every hour of delay is a scoring risk (the requester checks the
site on 3 different days, so uptime from day 1 matters).

## Environment note

The VM was replaced mid-session (~19:38 UTC): `/tmp` was wiped (the
Playwright install and first screenshot set were lost) and the HTTP
server died. Everything in `~/workspace` survived. Screenshot tooling now
lives in `.qa/` (git-ignored) instead of `/tmp`.
