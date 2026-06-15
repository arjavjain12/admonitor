// Daily worker for GitHub Actions: scrape → diff → email new ads, 7-day milestones,
// and a top-performers digest (hooks + scripts + videos). State persists in data/state.json.
import 'dotenv/config';
import { scrapeCompetitor, parseStarted } from '../src/scraper.js';
import { analyzeVideoBuffer, SCRIPT_PROMPT } from '../src/video.js';
import { loadAds, saveAds } from '../src/filestate.js';
import { sendNewAd, send7Day, sendDigest } from '../src/notify.js';
import { COMPETITORS, DIGEST_TOP_N, MAX_ANALYSES_PER_RUN, WINNER_DAYS } from '../src/config.js';

const DAY = 86400000;
const daysActive = (r, now) => Math.max(0, Math.round((now - (r.started_ts || r.first_seen)) / DAY));
const score = (r, now) => daysActive(r, now) + (r.variants >= 3 ? 40 : 0) + r.variants * 5;

async function fetchBuf(url) {
  try { const r = await fetch(url); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length > 1000 ? b : null; }
  catch { return null; }
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
  const newAds = [], milestones = [];

  for (const c of cards) {
    seenNow.add(c.id);
    const prev = state[c.id];
    if (!prev) {
      state[c.id] = {
        library_id: c.id, competitor: comp.name, media_type: c.media_type, body: c.body,
        started_on: c.started, started_ts: parseStarted(c.started), variants: c.variants,
        image_url: c.image_url, video_url: c.video_url, first_seen: now, last_seen: now,
        status: 'active', alerted_new: firstRun, alerted_7day: false,
      };
      if (!firstRun) newAds.push(state[c.id]);
    } else {
      prev.last_seen = now; prev.status = 'active'; prev.variants = c.variants;
      prev.video_url = c.video_url; prev.image_url = c.image_url;
      // backfill the start date if we missed it on an earlier run
      if (!prev.started_ts && c.started) { prev.started_on = c.started; prev.started_ts = parseStarted(c.started); }
    }
  }
  for (const id of Object.keys(state)) {
    if (!seenNow.has(id) && state[id].status === 'active') { state[id].status = 'inactive'; state[id].gone_at = now; }
  }
  for (const r of Object.values(state)) {
    if (r.status === 'active' && !r.alerted_7day && daysActive(r, now) >= WINNER_DAYS) milestones.push(r);
  }

  for (const r of [...newAds, ...milestones]) { r.daysActive = daysActive(r, now); await ensureAnalysis(r, budget); }
  const winners = Object.values(state).filter(r => r.status === 'active')
    .sort((a, b) => score(b, now) - score(a, now)).slice(0, DIGEST_TOP_N);
  for (const w of winners) { w.daysActive = daysActive(w, now); await ensureAnalysis(w, budget); }

  for (const ad of newAds) { await sendNewAd(comp, ad); ad.alerted_new = true; }
  for (const ad of milestones) { await send7Day(comp, ad); ad.alerted_7day = true; }
  await sendDigest(comp, winners);
  console.log(`[worker] ${comp.name}: ${newAds.length} new, ${milestones.length} milestone, ${winners.length} in digest${firstRun ? ' (seeded — no new-ad blast)' : ''}`);

  await saveAds(comp, state);
}

const now = Date.now();
const budget = { left: MAX_ANALYSES_PER_RUN };
for (const comp of COMPETITORS) {
  try { await runCompetitor(comp, now, budget); }
  catch (e) { console.error(`[worker] ${comp.name} FAILED: ${e.message}`); }
}
console.log('[worker] done');
