// Alias kept for convenience — reads the last run's result.
// (The actual run happens in the background fn run-background; this sync fn would
//  otherwise time out at ~10s on the free plan.)
export { default } from './result.mjs';
