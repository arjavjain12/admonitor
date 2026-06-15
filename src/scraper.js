import { chromium } from 'playwright';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { extractCards } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREATIVE_DIR = path.join(__dirname, '..', 'data', 'creatives');

// Download a creative to data/creatives/<id>.jpg so it survives Meta's signed-URL expiry.
// Returns the relative web path ("/creatives/<id>.jpg") or null.
export async function archiveCreative(libraryId, url) {
  if (!url) return null;
  if (!existsSync(CREATIVE_DIR)) mkdirSync(CREATIVE_DIR, { recursive: true });
  const file = path.join(CREATIVE_DIR, `${libraryId}.jpg`);
  const rel = `/creatives/${libraryId}.jpg`;
  if (existsSync(file)) return rel; // already archived
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null; // skip broken/blank
    writeFileSync(file, buf);
    return rel;
  } catch {
    return null;
  }
}

const SCROLL_SECONDS = Number(process.env.SCRAPE_SCROLL_SECONDS || 25);
const HEADLESS = process.env.HEADLESS !== 'false';

function buildUrl({ query, page_id, country = 'IN' }) {
  const base = 'https://www.facebook.com/ads/library/';
  const p = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country,
    media_type: 'all',
  });
  if (page_id) p.set('view_all_page_id', page_id);
  else {
    p.set('q', query);
    p.set('search_type', 'keyword_unordered');
  }
  return `${base}?${p.toString()}`;
}

export async function scrapeCompetitor(comp) {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    viewport: { width: 1280, height: 1800 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(buildUrl(comp), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    // Scroll to trigger lazy-loading of all cards.
    const deadline = Date.now() + SCROLL_SECONDS * 1000;
    let lastCount = 0, stable = 0;
    while (Date.now() < deadline) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const count = await page.evaluate(() => (document.body.innerText.match(/Library ID:/g) || []).length);
      if (count === lastCount) { if (++stable >= 3) break; } else { stable = 0; lastCount = count; }
    }

    const cards = await page.evaluate(extractCards);
    return cards;
  } finally {
    await browser.close();
  }
}

// Best-effort date parsing for "16 May 2026"
export function parseStarted(str) {
  if (!str) return null;
  const ts = Date.parse(str);
  return Number.isNaN(ts) ? null : ts;
}
