// Daily worker (GitHub Actions): scrape → diff → email new ads, scaling milestones (8d+),
// and a top-performers digest. Hooks + archived videos only for scaling/winners. New ads: link only.
import 'dotenv/config';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { scrapeCompetitor, parseStarted } from '../src/scraper.js';
import { analyzeVideoBuffer, SCRIPT_PROMPT } from '../src/video.js';
import { loadAds, saveAds } from '../src/filestate.js';
import { sendNewAd, sendScaling, sendDigest } from '../src/notify.js';
import { COMPETITORS, DIGEST_TOP_N, MAX_ANALYSES_PER_RUN, ARCHIVE_TOP_N, SCALING_DAYS, WINNER_DAYS } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATIVE_DIR = path.join(__dirname, '..', 'public', 'creatives');
const DAY = 86400000;
const daysActive = (r, now) => Math.max(0, Math.round((now - (r.started_ts || r.first_seen)) / DAY));
const isScaling = (r, now) => r.status === 'active' && (daysActive(r, now) >= SCALING_DAYS || r.variants >= 3);
const score = (r, now) => daysActive(r, now) + (r.variants >= 3 ? 40 : 0) + r.variants * 5;

async function fetchBuf(url) {
  try { const r = await fetch(url); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length > 1000 ? b : null; }
  catch { return null; }
}

// Download a scaling/winner video so the dashboard has a permanent copy (Meta URLs expire).
async function archiveVideo(rec) {
  if (rec.media_type !== 'video' || !rec.video_url) return;
  if (!existsSync(CREATIVE_DIR)) mkdirSync(CREATIVE_DIR, { recursive: true });
  const file = path.join(CREATIVE_DIR, `${rec.library_id}.mp4`);
  rec.creative_path = `/creatives/${rec.library_id}.mp4`;
  if (existsSync(file)) return;                       // already archived
  const buf = await fetchBuf(rec.video_url);
  if (buf) writeFileSync(file, buf); else delete rec.creative_path;
}

async function ensureAnalysis(rec, budget) {
  if (rec.analysis || rec.media_type !== 'video' || !rec.video_url || budget.left <= 0) return;
  const buf = await fetchBuf(rec.video_url);
  if (!buf) return;
  try {
    const { analysis } = await analyzeVideoBuffer(buf, { prompt: SCRIPT_PROMPT });
    if (!analysis._parseError) { rec.analysis = analysis; budget.left--; console.log(`  analyzed ${rec.library_id}`); }
  } catch (e) { console.error(`  analyze ${rec.library_id} failed: ${e.message}`); }
}

async function runCompetitor(comp, now, budget) {
  console.log(`[worker] scraping ${comp.name} ...`);
  const cards = await scrapeCompetitor(comp);
  console.log(`[worker] ${comp.name}: ${cards.length} active ads`);
  if (!cards.length) { console.warn('  0 ads — skipping (no state wipe)'); return; }

  const state = await loadAds(comp);
  const firstRun = Object.keys(state).length === 0;
  const seenNow = new Set();
  const newAds = [];

  for (const c of cards) {
    seenNow.add(c.id);
    const prev = state[c.id];
    if (!prev) {
      state[c.id] = {
        library_id: c.id, competitor: comp.name, media_type: c.media_type, body: c.body,
        started_on: c.started, started_ts: parseStarted(c.started), variants: c.variants,
        image_url: c.image_url, video_url: c.video_url, first_seen: now, last_seen: now,
        status: 'active', alerted_new: firstRun, alerted_scaling: false,
      };
      if (!firstRun) newAds.push(state[c.id]);
    } else {
      prev.last_seen = now; prev.status = 'active'; prev.variants = c.variants;
      prev.video_url = c.video_url; prev.image_url = c.image_url;
      if (!prev.started_ts && c.started) { prev.started_on = c.started; prev.started_ts = parseStarted(c.started); }
    }
  }
  for (const id of Object.keys(state)) {
    if (!seenNow.has(id) && state[id].status === 'active') { state[id].status = 'inactive'; state[id].gone_at = now; }
  }

  // Scaling/winners: analyze hook (budget-capped) + archive video for the top N (repo-size guard). New ads get nothing heavy.
  const scalingSet = Object.values(state).filter(r => isScaling(r, now)).sort((a, b) => score(b, now) - score(a, now));
  const archiveIds = new Set(scalingSet.slice(0, ARCHIVE_TOP_N).map(r => r.library_id));
  for (const r of scalingSet) {
    r.daysActive = daysActive(r, now);
    await ensureAnalysis(r, budget);
    if (archiveIds.has(r.library_id)) await archiveVideo(r);
  }

  // Just crossed the 8-day line → "now scaling" alert (once).
  const milestones = scalingSet.filter(r => !r.alerted_scaling && daysActive(r, now) >= SCALING_DAYS);
  const winners = scalingSet.slice(0, DIGEST_TOP_N);
  for (const r of newAds) r.daysActive = daysActive(r, now);

  for (const ad of newAds) { await sendNewAd(comp, ad); ad.alerted_new = true; }       // no video
  for (const ad of milestones) { await sendScaling(comp, ad); ad.alerted_scaling = true; } // video + hook + script
  await sendDigest(comp, winners);
  console.log(`[worker] ${comp.name}: ${newAds.length} new, ${milestones.length} newly-scaling, ${scalingSet.length} scaling/winners${firstRun ? ' (seeded)' : ''}`);

  await saveAds(comp, state);
}

const now = Date.now();
const budget = { left: MAX_ANALYSES_PER_RUN };
for (const comp of COMPETITORS) {
  try { await runCompetitor(comp, now, budget); }
  catch (e) { console.error(`[worker] ${comp.name} FAILED: ${e.message}`); }
}
console.log('[worker] done');
