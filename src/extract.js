// Shared in-page extractor. Executed via page.evaluate() in both the local and
// lambda scrapers. Returns one record per ad card (incl. video URL when present).
// Validated against the live Meta Ad Library.
export function extractCards() {
  const cards = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('div')) {
    const t = el.innerText || '';
    if (!/Library ID:\s*\d+/.test(t) || !/Started running/.test(t)) continue;
    if ((t.match(/Library ID:/g) || []).length !== 1) continue; // smallest single-card container
    const id = (t.match(/Library ID:\s*(\d+)/) || [])[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const started = (t.match(/Started running on ([0-9]{1,2} \w+ \d{4})/) || [])[1] || null;
    const variants = Number((t.match(/(\d+)\s+ads use this creative and text/i) || [])[1] || 1);

    // creative image: drop avatars, prefer ad-creative namespace + largest size token
    const imgs = [...el.querySelectorAll('img')]
      .filter(i => /scontent|fbcdn|cdninstagram/.test(i.src))
      .filter(i => !/[sp]\d?\d?x\d?\d?\b|[sp]60x60|[sp]40x40/.test(i.src));
    const sizeToken = i => Number((i.src.match(/[sp](\d{3,})x\d{3,}/) || [])[1] || 0);
    const score = i => (/t39\.35426/.test(i.src) ? 1e7 : 0) + sizeToken(i) * 1000 + (i.naturalWidth * i.naturalHeight || 0);
    const pool = imgs.length ? imgs : [...el.querySelectorAll('img')].filter(i => /scontent|fbcdn|cdninstagram/.test(i.src));
    const img = pool.sort((a, b) => score(b) - score(a))[0] || null;

    // video file (progressive mp4) if this is a video ad
    const vid = el.querySelector('video');
    const video_url = vid ? (vid.src || vid.currentSrc || null) : null;
    const media_type = (vid || /\d:\d\d\s*\/\s*\d:\d\d/.test(t)) ? 'video' : 'image';

    const link = el.querySelector('a[href*="l.facebook.com/l.php"], a[href^="http"]:not([href*="facebook.com/ads"])');
    let landing = null;
    if (link) { try { const u = new URL(link.href); landing = u.searchParams.get('u') || link.href; } catch { landing = link.href; } }

    const body = t
      .replace(/Library ID:\s*\d+/g, '')
      .replace(/Started running on[^\n]*/g, '')
      .replace(/^(Active|Inactive|Sponsored|Platforms|Menu|See ad details|Open Drop-down|This ad has.*|​)$/gim, '')
      .replace(/\n{2,}/g, '\n').trim().slice(0, 1200);

    const cta = ['Shop now', 'Shop Now', 'Learn more', 'Learn More', 'Sign up', 'Order now',
      'Buy now', 'Get offer', 'Book now', 'Download', 'Send message', 'Subscribe']
      .find(c => t.includes(c)) || null;

    cards.push({ id, started, variants, media_type, image_url: img ? img.src : null, video_url, landing_url: landing, cta, body });
  }
  return cards;
}
