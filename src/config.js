// Competitors to track. Use page_id for complete coverage (preferred) or query (keyword).
export const COMPETITORS = [
  { name: 'Invogue Shop', page_id: '114250088213898', query: 'invogueshop', country: 'IN' },
];

export const SCALING_DAYS = 8;          // crosses 8 days → graduate to "scaling" (analyze hook + archive video + alert)
export const WINNER_DAYS = 30;          // long-running winner
export const DIGEST_TOP_N = 5;          // best performers in the daily digest
export const MAX_ANALYSES_PER_RUN = 12; // cap Gemini video calls per run (cached, so daily cost ~ new graduates only)
