// Reads several blob keys so we can see cross-invocation state in one shot.
import { getStore } from '@netlify/blobs';
export default async () => {
  const store = getStore('admonitor');
  const out = {};
  for (const k of ['browsertest', 'diag', 'bgtest', 'blobtest']) {
    try { out[k] = await store.get(k, { type: 'json' }); } catch (e) { out[k] = `err:${e.message}`; }
  }
  return Response.json(out);
};
