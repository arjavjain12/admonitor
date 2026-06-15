// Background function (15-min limit) — runs the full daily job on demand for testing.
// Writes a staged diagnostic to Blobs so /result reveals exactly how far it got.
import { saveDiag } from '../../src/state.js';

export default async () => {
  const t0 = Date.now();
  const stage = async (s, extra = {}) => { try { await saveDiag({ stage: s, at: new Date().toISOString(), elapsedS: ((Date.now() - t0) / 1000).toFixed(1), ...extra }); } catch (e) { console.error('saveDiag failed', e.message); } };
  try {
    await stage('starting');
    const { runAll } = await import('./daily-alert.mjs'); // dynamic so import errors are catchable
    await stage('imported');
    const summary = await runAll();
    await saveDiag({ ...summary, stage: 'done', elapsedS: ((Date.now() - t0) / 1000).toFixed(1) });
    console.log('[run-background] done:', JSON.stringify(summary));
  } catch (e) {
    await stage('error', { error: String((e && e.stack) || e).slice(0, 1500) });
    console.error('[run-background] FAILED:', e);
  }
};
