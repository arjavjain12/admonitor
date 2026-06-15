// Static imports so Netlify traces + ships the external packages; staged diag to a blob.
import { getStore } from '@netlify/blobs';
import chromium from '@sparticuz/chromium';
import { chromium as pw } from 'playwright-core';

export default async () => {
  const store = getStore('admonitor');
  const put = (o) => store.setJSON('browsertest', { at: new Date().toISOString(), ...o });
  let browser;
  try {
    await put({ stage: 'start' });
    const exe = await chromium.executablePath();
    await put({ stage: 'got-exec', exe: (exe || 'EMPTY').slice(0, 80) });
    browser = await pw.launch({ args: chromium.args, executablePath: exe, headless: true });
    await put({ stage: 'launched' });
    const page = await browser.newPage();
    await page.goto('https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IN&q=invogueshop&search_type=keyword_unordered&media_type=all',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    const count = await page.evaluate(() => (document.body.innerText.match(/Library ID:/g) || []).length);
    const title = await page.title();
    const bodyStart = await page.evaluate(() => document.body.innerText.slice(0, 220));
    await put({ stage: 'done', adsFound: count, title, bodyStart });
  } catch (e) {
    await put({ stage: 'error', error: String((e && e.stack) || e).slice(0, 1400) });
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
};
