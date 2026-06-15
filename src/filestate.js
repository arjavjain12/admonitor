// File-based state for the GitHub Actions worker. One JSON file holds all competitors,
// committed back to the repo each run so it persists between scheduled runs.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'state.json');

const slug = (comp) => (comp.query || comp.page_id || comp.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');

function readAll() {
  try { return JSON.parse(readFileSync(FILE, 'utf8')); } catch { return {}; }
}

export async function loadAds(comp) {
  return readAll()[slug(comp)] || {};
}

export async function saveAds(comp, map) {
  const all = readAll();
  all[slug(comp)] = map;
  if (!existsSync(path.dirname(FILE))) mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
