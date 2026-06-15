// Competitors to track. page_id = exact page coverage (preferred); query is a fallback label.
export const COMPETITORS = [
  { name: 'Invogue Shop',        page_id: '114250088213898', query: 'invogueshop', country: 'IN' },
  { name: 'Krvvy',               page_id: '536086762923254', query: 'staykrvvy',   country: 'IN' },
  { name: 'Underneat',           page_id: '499374739933459', query: 'underneat',   country: 'IN' },
  { name: 'Shapercult.Official', page_id: '392138857305657', query: 'shapercult',  country: 'IN' },
];

export const SCALING_DAYS = 8;          // crosses 8 days → graduate to "scaling" (analyze hook + archive video + alert)
export const WINNER_DAYS = 30;          // long-running winner
export const DIGEST_TOP_N = 5;          // best performers per competitor in the daily digest
export const MAX_ANALYSES_PER_RUN = 12; // cap Gemini video calls per run (shared across competitors; cached)
export const ARCHIVE_TOP_N = 20;        // archive videos for the top N scaling/winners per competitor (repo-size guard)
