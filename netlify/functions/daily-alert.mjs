// Netlify Scheduled Function — runs daily.
// For each competitor: scrape → diff vs Blob state → email new ads, 7-day milestones,
// and a top-performers digest. Hooks + scripts come from Gemini; videos are attached.
import { scrapeCompetitorLambda, parseStarted } from '../../src/scraper-lambda.js';
import { analyzeVideoBuffer, SCRIPT_PROMPT } from '../../src/video.js';
import { loadAds, saveAds, saveDiag } from '../../src/state.js';
import { sendNewAd, send7Day, sendDigest } from '../../src/notify.js';
import { COMPETITORS, DIGEST_TOP_N, MAX_ANALYSES_PER_RUN, WINNER_DAYS } from '../../src/config.js';

const DAY = 86400000;

function daysActive(rec, now) {
  const base = rec.started_ts || rec.first_seen;
  return Math.max(0, Math.round((now - base) / DAY));
}
function winnerScore(rec, now) {
  return daysActive(rec, now) + (rec.variants >= 3 ? 40 : 0) + rec.variants * 5;
}

async function fetchBuf(url) {
  try { const r = await fetch(url); if (!r.ok) return null; const b = Buffer.from(await r.arrayBuffer()); return b.length > 1000 ? b : null; }
  catch { return null; }
}

// Analyze a video ad once; cache the result on the record. Respects a per-run budget.
async function ensureAnalysis(rec, budget) {
  if (rec.analysis || rec.media_type !== 'video' || !rec.video_url || budget.left <= 0) return rec;
  const buf = await fetchBuf(rec.video_url);
  if (!buf) return rec;
  try {
    const { analysis } = await analyzeVideoBuffer(buf, { prompt: SCRIPT_PROMPT });
    if (!analysis._parseError) { rec.analysis = analysis; budget.left--; }
  } catch (e) { console.error(`[analyze] ${rec.library_id}: ${e.message}`); }
  return rec;
}

async function runCompetitor(comp, now, budget) {
  const t0 = Date.now();
  const cards = await scrapeCompetitorLambda(comp);
  console.log(`[daily] ${comp.name}: ${cards.length} active ads`);
  if (!cards.length) {
    // likely IP-blocked or transient — don't wipe state
    return { name: comp.name, adsFound: 0, blockedOrEmpty: true, elapsedS: ((Date.now() - t0) / 1000).toFixed(1) };
  }

  const state = await loadAds(comp);
  const firstRun = Object.keys(state).length === 0;
  const seenNow = new Set();
  const newAds = [], milestoneAds = [];

  for (const c of cards) {
    seenNow.add(c.id);
    const prev = state[c.id];
    if (!prev) {
      state[c.id] = {
        library_id: c.id, competitor: comp.name, media_type: c.media_type,
        body: c.body, started_on: c.started, started_ts: parseStarted(c.started),
        variants: c.variants, image_url: c.image_url, video_url: c.video_url,
        first_seen: now, last_seen: now, status: 'active',
        alerted_new: firstRun,        // seed run: don't blast emails for the back-catalogue
        alerted_7day: false,
      };
      if (!firstRun) newAds.push(state[c.id]);
    } else {
      prev.last_seen = now; prev.status = 'active';
      prev.variants = c.variants; prev.video_url = c.video_url; prev.image_url = c.image_url;
    }
  }
  // mark disappeared as inactive
  for (const id of Object.keys(state)) {
    if (!seenNow.has(id) && state[id].status === 'active') { state[id].status = 'inactive'; state[id].gone_at = now; }
  }
  // 7-day milestones (active, crossed threshold, not yet pinged)
  for (const rec of Object.values(state)) {
    if (rec.status === 'active' && !rec.alerted_7day && daysActive(rec, now) >= WINNER_DAYS) milestoneAds.push(rec);
  }

  // Enrich (Gemini) — new ads, milestones, then top digest winners, within budget
  for (const rec of [...newAds, ...milestoneAds]) { rec.daysActive = daysActive(rec, now); await ensureAnalysis(rec, budget); }

  const winners = Object.values(state).filter(r => r.status === 'active')
    .sort((a, b) => winnerScore(b, now) - winnerScore(a, now)).slice(0, DIGEST_TOP_N);
  for (const w of winners) { w.daysActive = daysActive(w, now); await ensureAnalysis(w, budget); }

  // Send
  for (const ad of newAds) { await sendNewAd(comp, ad); ad.alerted_new = true; }
  for (const ad of milestoneAds) { await send7Day(comp, ad); ad.alerted_7day = true; }
  await sendDigest(comp, winners);
  if (firstRun) console.log(`[daily] ${comp.name}: seeded ${cards.length} ads (no new-ad blast on first run)`);

  await saveAds(comp, state);

  return {
    name: comp.name, adsFound: cards.length, firstRun,
    newAds: newAds.length, milestones: milestoneAds.length,
    elapsedS: ((Date.now() - t0) / 1000).toFixed(1),
    topWinners: winners.map(w => ({
      id: w.library_id, days: w.daysActive, variants: w.variants,
      media: w.media_type, hook: w.analysis?.hook || (w.body || '').split('\n')[0]?.slice(0, 80) || null,
    })),
  };
}

// Run all competitors, return a summary (used by the scheduled fn and the test trigger).
export async function runAll() {
  const now = Date.now();
  const budget = { left: MAX_ANALYSES_PER_RUN };
  const competitors = [];
  for (const comp of COMPETITORS) {
    try { competitors.push(await runCompetitor(comp, now, budget)); }
    catch (e) { competitors.push({ name: comp.name, error: e.message }); }
  }
  return { ranAt: new Date(now).toISOString(), smtp: !!process.env.SMTP_HOST, competitors };
}

export default async () => {
  const summary = await runAll();
  try { await saveDiag(summary); } catch { /* blobs optional */ }
  return new Response(JSON.stringify(summary), { headers: { 'content-type': 'application/json' } });
};

export const config = { schedule: '0 9 * * *' }; // daily 09:00 UTC
