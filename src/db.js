import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'data', 'admonitor.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS ads (
  library_id   TEXT PRIMARY KEY,
  competitor   TEXT NOT NULL,
  body         TEXT,
  cta          TEXT,
  landing_url  TEXT,
  image_url    TEXT,
  started_on   TEXT,           -- e.g. "16 May 2026"
  started_ts   INTEGER,        -- parsed epoch ms (best effort)
  status       TEXT,           -- 'active' | 'inactive'
  variants     INTEGER DEFAULT 1,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  gone_at      INTEGER         -- when it first disappeared from active results
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,   -- 'new' | 'killed'
  library_id  TEXT NOT NULL,
  competitor  TEXT NOT NULL,
  ts          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ads_competitor ON ads(competitor);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
`);

// --- lightweight migrations (SQLite has no ADD COLUMN IF NOT EXISTS) ---
const cols = new Set(db.prepare(`PRAGMA table_info(ads)`).all().map(c => c.name));
if (!cols.has('creative_path')) db.exec(`ALTER TABLE ads ADD COLUMN creative_path TEXT`);
if (!cols.has('media_type'))    db.exec(`ALTER TABLE ads ADD COLUMN media_type TEXT DEFAULT 'image'`);

export const getAd = db.prepare('SELECT * FROM ads WHERE library_id = ?');

export const insertAd = db.prepare(`
  INSERT INTO ads (library_id, competitor, body, cta, landing_url, image_url, creative_path, media_type,
                   started_on, started_ts, status, variants, first_seen, last_seen)
  VALUES (@library_id, @competitor, @body, @cta, @landing_url, @image_url, @creative_path, @media_type,
          @started_on, @started_ts, @status, @variants, @first_seen, @last_seen)
`);

export const updateAdSeen = db.prepare(`
  UPDATE ads SET last_seen=@last_seen, status='active', variants=@variants,
                 body=@body, cta=@cta, landing_url=@landing_url, image_url=@image_url,
                 creative_path=COALESCE(@creative_path, creative_path), media_type=@media_type,
                 gone_at=NULL
  WHERE library_id=@library_id
`);

export const markKilled = db.prepare(`
  UPDATE ads SET status='inactive', gone_at=@gone_at WHERE library_id=@library_id AND status='active'
`);

export const activeIdsFor = db.prepare(
  `SELECT library_id FROM ads WHERE competitor=? AND status='active'`
);

export const insertEvent = db.prepare(
  `INSERT INTO events (type, library_id, competitor, ts) VALUES (?, ?, ?, ?)`
);

export const allAds = db.prepare('SELECT * FROM ads ORDER BY first_seen DESC');
export const recentEvents = db.prepare(
  `SELECT e.*, a.body, a.image_url, a.landing_url, a.started_on, a.variants
   FROM events e LEFT JOIN ads a ON a.library_id = e.library_id
   ORDER BY e.ts DESC LIMIT ?`
);

export default db;
