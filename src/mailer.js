import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_TO, ALERT_FROM } = process.env;

const enabled = SMTP_HOST && SMTP_USER && SMTP_PASS && ALERT_TO;

const transporter = enabled
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 465),
      secure: Number(SMTP_PORT || 465) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

export async function sendNewAdsEmail(newAds) {
  if (!enabled) {
    console.log(`[mailer] disabled (no SMTP config) — ${newAds.length} new ads not emailed`);
    return;
  }
  if (!newAds.length) return;

  const rows = newAds.map(a => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top">
        ${a.image_url ? `<img src="${a.image_url}" width="90" style="border-radius:8px">` : ''}
      </td>
      <td style="padding:10px;border-bottom:1px solid #eee;vertical-align:top;font:14px system-ui">
        <b>${a.competitor}</b> · started ${a.started_on || 'recently'} · ${a.variants > 1 ? `🔥 ${a.variants} variants` : '1 variant'}<br>
        <span style="color:#444">${(a.body || '').slice(0, 220).replace(/</g, '&lt;')}</span><br>
        ${a.landing_url ? `<a href="${a.landing_url}">${a.landing_url.slice(0, 60)}</a> · ` : ''}
        <a href="https://www.facebook.com/ads/library/?id=${a.library_id}">View on Meta →</a>
      </td>
    </tr>`).join('');

  await transporter.sendMail({
    from: ALERT_FROM || SMTP_USER,
    to: ALERT_TO,
    subject: `🆕 ${newAds.length} new competitor ad${newAds.length > 1 ? 's' : ''} launched`,
    html: `<div style="max-width:640px;margin:auto;font:14px system-ui">
      <h2 style="font:600 18px system-ui">New ads detected</h2>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <p style="color:#888;font-size:12px">AdMonitor · proxy signals only (Meta does not publish spend for commercial ads)</p>
    </div>`,
  });
  console.log(`[mailer] emailed ${newAds.length} new ads to ${ALERT_TO}`);
}
