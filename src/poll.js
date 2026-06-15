import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { scrapeCompetitor, parseStarted, archiveCreative } from './scraper.js';
import { sendNewAdsEmail } from './mailer.js';
import {
  getAd, insertAd, updateAdSeen, markKilled,
  activeIdsFor, insertEvent,
} from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const competitors = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'competitors.json'), 'utf8')
);

async function run() {
  const now = Date.now();
  const newAdsForEmail = [];

  for (const comp of competitors) {
    console.log(`[poll] scraping ${comp.name} ...`);
    let cards;
    try {
      cards = await scrapeCompetitor(comp);
    } catch (e) {
      console.error(`[poll] FAILED ${comp.name}: ${e.message}`);
      continue; // defensive: one competitor failing must not abort the run
    }
    console.log(`[poll] ${comp.name}: ${cards.length} active ads found`);

    const seenNow = new Set();
    for (const c of cards) {
      seenNow.add(c.id);
      const existing = getAd.get(c.id);
      // Archive the creative to disk so it survives Meta's signed-URL expiry.
      const creative_path = await archiveCreative(c.id, c.image_url);
      const row = {
        library_id: c.id,
        competitor: comp.name,
        body: c.body,
        cta: c.cta,
        landing_url: c.landing_url,
        image_url: c.image_url,
        creative_path,
        media_type: c.media_type || 'image',
        started_on: c.started,
        started_ts: parseStarted(c.started),
        status: 'active',
        variants: c.variants || 1,
        first_seen: now,
        last_seen: now,
      };
      if (!existing) {
        insertAd.run(row);
        insertEvent.run('new', c.id, comp.name, now);
        newAdsForEmail.push(row);
      } else {
        updateAdSeen.run(row);
      }
    }

    // Anything previously active for this competitor but absent now = killed.
    for (const { library_id } of activeIdsFor.all(comp.name)) {
      if (!seenNow.has(library_id)) {
        markKilled.run({ library_id, gone_at: now });
        insertEvent.run('killed', library_id, comp.name, now);
      }
    }
  }

  console.log(`[poll] done. ${newAdsForEmail.length} brand-new ads this run.`);
  await sendNewAdsEmail(newAdsForEmail);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
