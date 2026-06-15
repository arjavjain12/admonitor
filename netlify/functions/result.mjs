// Fast sync reader — returns the diagnostic summary written by the last run.
import { loadDiag } from '../../src/state.js';

export default async () => {
  const diag = await loadDiag();
  return new Response(JSON.stringify(diag || { note: 'no run yet — POST /.netlify/functions/run-background first' }, null, 2),
    { headers: { 'content-type': 'application/json' } });
};
