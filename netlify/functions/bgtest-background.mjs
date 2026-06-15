// Trivial background fn: does background execution even run on this plan?
import { getStore } from '@netlify/blobs';
export default async () => {
  await getStore('admonitor').setJSON('bgtest', { ran: true, at: new Date().toISOString() });
};
