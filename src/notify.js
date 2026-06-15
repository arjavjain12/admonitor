import nodemailer from 'nodemailer';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_TO, ALERT_FROM } = process.env;
const enabled = SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_TO;

const tx = enabled ? nodemailer.createTransport({
  host: SMTP_HOST, port: Number(SMTP_PORT || 587),
  secure: Number(SMTP_PORT || 587) === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
}) : null;

const esc = s => (s || '').replace(/</g, '&lt;');

// Download the (freshly-scraped) video so we can attach it before its URL expires.
async function fetchVideo(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 1000 ? buf : null;
  } catch { return null; }
}

function scriptHtml(ad) {
  const tl = ad.analysis?.timeline;
  if (!tl?.length) return '';
  const rows = tl.map(s => `<tr>
    <td style="padding:4px 8px;color:#888;white-space:nowrap;vertical-align:top">${esc(s.t)}</td>
    <td style="padding:4px 8px">${s.voiceover_verbatim ? `🗣 "${esc(s.voiceover_verbatim)}"<br>` : ''}${s.onscreen_text_verbatim ? `🔤 ${esc(s.onscreen_text_verbatim)}<br>` : ''}<span style="color:#777">🎬 ${esc(s.visual)}</span></td>
  </tr>`).join('');
  return `<h4 style="margin:14px 0 4px">Full script & visuals</h4><table style="border-collapse:collapse;font-size:13px">${rows}</table>`;
}

function adBlock(ad, badge) {
  const hook = ad.analysis?.hook || (ad.body || '').split('\n')[0] || '(no hook detected)';
  return `<div style="border:1px solid #e3e3e3;border-radius:10px;padding:16px;margin:14px 0;font:14px system-ui">
    <div style="font-size:12px;color:#b45309;font-weight:700">${badge}</div>
    <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px 12px;margin:8px 0;border-radius:6px">
      <div style="font-size:11px;letter-spacing:.08em;color:#92400e;font-weight:700">🪝 HOOK</div>
      <div style="font-size:16px;font-weight:600">"${esc(hook)}"</div>
    </div>
    <div style="color:#555">${ad.media_type === 'video' ? '🎬 video' : '🖼 image'} · started ${esc(ad.started_on) || '—'} · ${ad.daysActive ?? '?'}d live · ${ad.variants} variant(s)</div>
    ${ad.analysis?.summary ? `<p>${esc(ad.analysis.summary)}</p>` : ''}
    ${scriptHtml(ad)}
    <p><a href="https://www.facebook.com/ads/library/?id=${ad.library_id}">View on Meta Ad Library →</a></p>
  </div>`;
}

async function videoFor(ad) {
  // prefer the archived local copy (permanent); fall back to the fresh signed URL
  if (ad.creative_path) {
    const f = path.join(PUBLIC, ad.creative_path.replace(/^\//, ''));
    if (existsSync(f)) return readFileSync(f);
  }
  return ad.video_url ? fetchVideo(ad.video_url) : null;
}

async function send(subject, html, ads, attachVideos = true) {
  if (!enabled) { console.log(`[notify] SMTP disabled — would send: ${subject}`); return; }
  const attachments = [];
  if (attachVideos) for (const ad of ads) {
    const buf = await videoFor(ad);
    if (buf) attachments.push({ filename: `${ad.library_id}.mp4`, content: buf });
  }
  await tx.sendMail({ from: ALERT_FROM || SMTP_USER, to: ALERT_TO, subject, html, attachments });
  console.log(`[notify] sent "${subject}" with ${attachments.length} video(s)`);
}

// New ad: lightweight — caption hook + Meta link, NO video.
export function sendNewAd(comp, ad) {
  return send(`🆕 New ${comp.name} ad — "${(ad.analysis?.hook || ad.body || '').slice(0, 60)}"`,
    `<h2>🆕 ${comp.name} just launched a new ad</h2>${adBlock(ad, '🆕 NEW AD')}`, [ad], false);
}

// Crossed 8 days → graduating to scaling. Full package: hook + script + archived video.
export function sendScaling(comp, ad) {
  return send(`🔥 ${comp.name} ad now scaling (8+ days live)`,
    `<h2>🔥 This ${comp.name} ad crossed 8 days — it's working & scaling</h2>${adBlock(ad, '🔥 SCALING — 8+ DAYS LIVE')}`, [ad], true);
}

export function sendDigest(comp, winners) {
  if (!winners.length) return;
  return send(`📊 ${comp.name} — top ${winners.length} scaling/winning ads`,
    `<h2>📊 ${comp.name} — best performers (by longevity & variants)</h2>${winners.map(w => adBlock(w, '🏆 TOP PERFORMER')).join('')}`,
    winners, true);
}
