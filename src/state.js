// Persistent state via Netlify Blobs (functions have no disk).
// One JSON blob per competitor holding a map of library_id -> ad record.
import { getStore } from '@netlify/blobs';

const store = () => getStore('admonitor');
const keyFor = (comp) => `ads/${(comp.query || comp.page_id || comp.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;

export async function loadAds(comp) {
  const data = await store().get(keyFor(comp), { type: 'json' });
  return data || {};
}

export async function saveAds(comp, map) {
  await store().setJSON(keyFor(comp), map);
}

// Diagnostic summary of the last run (so the test trigger can report results).
export async function saveDiag(obj) { await store().setJSON('diag', obj); }
export async function loadDiag() { return await store().get('diag', { type: 'json' }); }
