# 6670 台灣好行日月潭線 · 搭乘人次 3D 視覺化

A 3D, time-based visualization of smart-card ridership on intercity bus route **6670** (臺中 ⇄ 高鐵臺中站 ⇄ 埔里 ⇄ 日月潭), covering 2024–2025. The data is 1,800,910 tap-in/tap-out trips.

- **Timeline mode**: a daily stacked area chart by sub-route. Press play to step day by day. Each stop shows a pair of 3D columns, boardings in blue and alightings in orange.
- **Day replay**: every trip from the selected day is animated along the road at its real tap-in and tap-out times. Rider bubbles grow with the number of people on board, and the columns accumulate over the day.

Stack: TanStack Start (React 19) on Cloudflare Workers, tRPC, Drizzle ORM, Turso/libSQL, deck.gl 9, and Tailwind 4.

## Data sources

| Layer | Source |
|---|---|
| Terrain | 內政部 20m DEM (data.gov.tw 35430) |
| Township borders | 內政部國土測繪中心 鄉鎮市區界線 (data.gov.tw 7441) |
| Stop locations | 交通部觀光署 台灣好行站點 (data.gov.tw 93967) |
| Roads: 國道 / 快速公路 / 省道 | 內政部國土測繪中心 road centrelines (data.gov.tw 73232) |
| Roads: 臺中市 streets | 臺中市政府 GIS road centrelines (data.gov.tw 162899) |
| Roads: 縣道 / 鄉道 | OpenStreetMap (ODbL). No official file can be downloaded without registration. |
| District labels | Placed inside each 內政部 township polygon |
| Bus paths | OSRM / OpenStreetMap routing between the official stop coordinates. Official TDX shapes need an API key. |
| Ridership | `2024年/2025年_6670刷卡資料.xlsx`. These files are not committed, and card numbers and driver IDs are dropped. |

[`public/geo/SOURCES.md`](public/geo/SOURCES.md) has the full details. The scripts that build the assets are in `scripts/geo/`.

## Setup

```bash
bun install
# .env (git-ignored): DATABASE_URL=libsql://…turso.io  DATABASE_TOKEN=…
bun run db:push          # create tables
bun run data:etl         # Excel → data/trips.csv (needs uv)
bun run data:load        # CSV → Turso, then builds the daily aggregate tables
bun run dev              # http://localhost:3000
```

### Tables

| Table | Contents |
|---|---|
| `trips` | One row per trip: board/alight time and stop, sub-route, ticket type, fares |
| `daily_subroute` | Trips and revenue per day and sub-route |
| `daily_stop` | Boardings and alightings per day and stop |
| `daily_hour` | Boardings per day and hour |

## Deploy (Cloudflare)

```bash
bunx wrangler secret put DATABASE_URL
bunx wrangler secret put DATABASE_TOKEN
bun run deploy
```

The app deploys as a Worker with static assets, which is Cloudflare's current target for full-stack TanStack Start. Pages only serves static sites, and this app needs server routes for the database API.
