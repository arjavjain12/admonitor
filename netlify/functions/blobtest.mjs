// Independent Blobs self-test (no Chromium import) — isolates whether Netlify Blobs works.
import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store = getStore('admonitor');
    await store.setJSON('blobtest', { hello: 'world', at: new Date().toISOString() });
    const back = await store.get('blobtest', { type: 'json' });
    return Response.json({ ok: true, roundtrip: back });
  } catch (e) {
    return Response.json({ ok: false, error: String((e && e.stack) || e).slice(0, 800) }, { status: 500 });
  }
};
