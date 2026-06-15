// Lambda/Netlify-compatible scraper: playwright-core + @sparticuz/chromium.
import chromium from '@sparticuz/chromium';
import { chromium as pwChromium } from 'playwright-core';
import { extractCards } from './extract.js';

function buildUrl({ query, page_id, country = 'IN' }) {
  const p = new URLSearchParams({ active_status: 'active', ad_type: 'all', country, media_type: 'all' });
  if (page_id) p.set('view_all_page_id', page_id);
  else { p.set('q', query); p.set('search_type', 'keyword_unordered'); }
  return `https://www.facebook.com/ads/library/?${p.toString()}`;
}

export async function scrapeCompetitorLambda(comp, { scrollSeconds = 20 } = {}) {
  const browser = await pwChromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    viewport: { width: 1280, height: 1800 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();
  try {
    await page.goto(buildUrl(comp), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);

    const deadline = Date.now() + scrollSeconds * 1000;
    let last = 0, stable = 0;
    while (Date.now() < deadline) {
      await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
      await page.waitForTimeout(1500);
      const n = await page.evaluate(() => (document.body.innerText.match(/Library ID:/g) || []).length);
      if (n === last) { if (++stable >= 3) break; } else { stable = 0; last = n; }
    }
    return await page.evaluate(extractCards);
  } finally {
    await browser.close();
  }
}

export function parseStarted(str) {
  if (!str) return null;
  const ts = Date.parse(str);
  return Number.isNaN(ts) ? null : ts;
}
