# AdMonitor

Track competitors' **Meta Ad Library** ads, infer which are working, and get emailed the instant a competitor launches a new ad.

> ⚠️ Meta does **not** publish spend/impressions/CTR for normal commercial ads. "Performance" here is **inferred** from public proxy signals: how long an ad has been running (`days_active`) and how many live variants it has (advertisers clone winners, kill losers). Same method every competitor-ad tool uses.

## How it works
```
competitors.json → poll.js (Playwright scrapes Meta Ad Library)
   → diff vs SQLite → new ads? email + flag "NEW"
   → server.js serves the dashboard (winners / scaling / new / killed-fast)
```
There is **no push from Meta** when a competitor launches an ad. The cron poll + diff *is* the "on activity" trigger — run it every 30–60 min to get near-real-time alerts.

## Setup
```bash
npm install
npm run setup            # installs Playwright chromium
cp .env.example .env     # fill in SMTP for email alerts (optional)
```

## Use
```bash
npm run poll             # scrape all competitors, store, email new ads
npm run serve            # dashboard at http://localhost:8080
```

## Add competitors
Edit `competitors.json`. Use a keyword (advertiser name) **or** a known page id:
```json
[
  { "name": "Invogue Shop", "query": "invogueshop", "country": "IN" },
  { "name": "Some Brand",   "page_id": "100088791537485", "country": "IN" }
]
```

## Run on a schedule (VPS)
```cron
# every 45 min
*/45 * * * * cd /path/to/admonitor && /usr/bin/node src/poll.js >> data/poll.log 2>&1
```
Keep the dashboard up with `pm2 start src/server.js --name admonitor`.

## Insight buckets
- 🏆 **Winner** — active 30+ days (they don't keep losers live)
- 🔥 **Scaling** — 3+ live variants of one concept (budget going in)
- 🆕 **New** — first seen in the last 7 days
- 💀 **Killed fast** — ran <7 days then disappeared (what *didn't* work for them)

## Known tuning knob
`SCRAPE_SCROLL_SECONDS` (default 25) controls how long it scrolls to lazy-load ads. Bump it to capture all results for advertisers with 100+ ads.
