# Deploying AdMonitor to Netlify

## What's here
- `netlify/functions/daily-alert.mjs` — **Scheduled Function** (cron `0 9 * * *`, daily 09:00 UTC). Scrapes → diffs → emails new ads, 7-day milestones, and a top-performers digest.
- `netlify/functions/daily-alert-run.mjs` — manual trigger for testing: `GET /.netlify/functions/daily-alert-run`
- Scraper: `playwright-core` + `@sparticuz/chromium` (Lambda Chromium)
- State: **Netlify Blobs** (no disk in functions)
- Hooks/scripts: Gemini · Video: attached to the email

## Required environment variables (set in Netlify → Site config → Environment variables)
| Var | Value |
|---|---|
| `GEMINI_API_KEY` | (your Gemini key) |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `SMTP_HOST` | your mail host |
| `SMTP_PORT` | `587` or `465` |
| `SMTP_USER` | smtp username |
| `SMTP_PASS` | smtp password |
| `ALERT_TO` | `aj01dude@gmail.com` |
| `ALERT_FROM` | e.g. `AdMonitor <alerts@yourdomain>` |

## Deploy steps
```bash
npm install
# auth: token from Netlify → User settings → Applications → Personal access tokens
export NETLIFY_AUTH_TOKEN=...
npx netlify-cli sites:create --name admonitor-<you>   # or: netlify link
npx netlify-cli env:import .env                        # push env vars
npx netlify-cli deploy --build --prod
# test immediately (don't wait for 9am UTC):
curl https://<your-site>.netlify.app/.netlify/functions/daily-alert-run
```

## ⚠️ The make-or-break test
On that first `daily-alert-run`, check the function logs:
- **`Invogue Shop: N active ads`** with N>0 → Meta serves Netlify's IP. 🎉 We're live.
- **`0 active ads`** repeatedly → Meta is blocking the datacenter IP. Then we move ONLY the worker to the Hostinger VPS (same code) and keep the dashboard on Netlify.
