import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import db, { allAds, recentEvents } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/creatives', express.static(path.join(__dirname, '..', 'data', 'creatives')));

const DAY = 86400000;

function enrich(a) {
  const end = a.status === 'active' ? Date.now() : (a.gone_at || a.last_seen);
  const base = a.started_ts || a.first_seen;
  const daysActive = Math.max(0, Math.round((end - base) / DAY));
  let bucket = 'running';
  if (a.status === 'active' && daysActive >= 30) bucket = 'winner';
  else if (a.status === 'inactive' && daysActive < 7) bucket = 'killed_fast';
  else if (a.status === 'inactive') bucket = 'retired';
  if (a.variants >= 3) bucket = a.status === 'active' ? 'scaling' : bucket;
  return { ...a, daysActive, bucket };
}

app.get('/api/ads', (req, res) => {
  res.json(allAds.all().map(enrich));
});

app.get('/api/insights', (req, res) => {
  const ads = allAds.all().map(enrich);
  const active = ads.filter(a => a.status === 'active');
  res.json({
    totals: {
      tracked: ads.length,
      active: active.length,
      winners: active.filter(a => a.daysActive >= 30).length,
      scaling: active.filter(a => a.variants >= 3).length,
      newThisWeek: ads.filter(a => Date.now() - a.first_seen < 7 * DAY).length,
      killedFast: ads.filter(a => a.bucket === 'killed_fast').length,
    },
    byCompetitor: Object.values(active.reduce((m, a) => {
      (m[a.competitor] ??= { competitor: a.competitor, active: 0, winners: 0, scaling: 0 });
      m[a.competitor].active++;
      if (a.daysActive >= 30) m[a.competitor].winners++;
      if (a.variants >= 3) m[a.competitor].scaling++;
      return m;
    }, {})),
    events: recentEvents.all(30),
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`AdMonitor dashboard → http://localhost:${PORT}`));
