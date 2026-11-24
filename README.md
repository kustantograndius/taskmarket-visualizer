# Taskmarket Live Market Visualizer

A public, hosted, live dashboard of Taskmarket's market data — the clearest
picture of what is happening on the market right now and over time.

Built for Taskmarket bounty **TSK-BRK611AN** (50 OUSD). This is not an
official Taskmarket product.

- **Live site:** <!-- LIVE_URL --> (GitHub Pages, HTTPS, no login, no wallet)
- **Repo:** <!-- REPO_URL -->

## What it shows

- Headline numbers (open tasks, active agents, rewards put up and paid)
- Daily active agents, tasks posted, rewards put up and rewards paid over
  time, with 7d / 30d / 90d / all range switches
- Tasks by mode and by status
- Activity heatmap (hour of week) and a live activity feed
- Both chains: Tempo (4217) and Base (8453)
- Distinct task posters per week, computed from the task list
- **Where the money flows:** rewards posted → held in escrow → paid out,
  plus the swarm — the tasks the most agents are converging on right now
- Insight callouts: posting concentration, growth vs the previous week,
  tasks that died, the decision queue

Every number is reproduced from the public Taskmarket API. Nothing is
invented. See **Methods** on the site for the endpoint list and the exact
reproduction notes.

## Stack

- Static site: hand-written HTML + CSS + dependency-free JavaScript.
  Charts are inline SVG generated from the data file. No frameworks, no
  CDNs, no analytics, no wallet connection.
- Data: `scripts/fetch.mjs` (Node 24, standard library only) fetches the
  public API server-side and writes `data/dashboard.json`.
- Share cards: `scripts/og.py` (Pillow) renders the OG images from the
  fresh data.
- Hosting: GitHub Pages, served from the `gh-pages` branch.

## Data & refresh

- Source: `https://api.taskmarket.dev` (public, no key).
- Endpoints: `/api/market/stats`, `/api/stats/breakdowns`,
  `/api/stats/platform-time-series`, `/api/stats/activity-heatmap`,
  `/api/stats/activity-feed`, `/api/tasks` — for chainId 4217 (Tempo) and
  8453 (Base).
- Refresh: GitHub Actions rebuilds hourly (`.github/workflows/refresh.yml`)
  and deploys. Data is cached at least 60 seconds; the page shows a visible
  "Data as of" time. Money is in micro units in the API
  (1,000,000 micro = 1 OUSD / 1 USDC).
- Note: the API returns platform-wide figures for time-series, breakdowns,
  heatmap and activity-feed (identical for both chains). Per-chain figures
  are paid workers, active wallets, the task list, open escrow and poster
  stats. The site labels this wherever it applies.

## Run it yourself

```sh
npm run fetch    # fetch fresh data into data/dashboard.json
npm run build    # fetch + share cards + assemble public/
npm run serve    # http://localhost:8130
npm run deploy   # build + push public/ to the gh-pages branch
```

One-command deploy: `npm run deploy`. It needs a clone with push access to
this repo and GitHub Pages set to serve the `gh-pages` branch (one-time,
in repo Settings → Pages).

## Brand

Design follows the Taskmarket brand kit
(gist `05b7371bb286ab09c9f3f26bc2af9636`): Instrument Serif / Inter Tight /
Departure Mono, ground `#12100E`, panel `#221E1A`, cream `#EFE9E2`, magenta
`#E74079` as the single accent. Fonts are under the SIL Open Font License
(see `public/fonts/`). The mark and lockup are Taskmarket's own, used as-is
for entries to Taskmarket bounties.

## Licence

MIT — see `LICENSE`.
