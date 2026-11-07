// EXPONENTIAL BACKOFF with jitter.
//   attempt 1 failed -> wait  base * 1  (1s)
//   attempt 2 failed -> wait  base * 2  (2s)
//   attempt 3 failed -> wait  base * 4  (4s)
//   attempt 4 failed -> wait  base * 8  (8s)  ... never more than maxDelay.
// Jitter (+/- 20%) stops many workers from retrying at the exact same moment and hammering a service
// that is just coming back up.
export interface BackoffOptions {
  baseDelayMs: number;
  maxDelayMs: number;
  jitter?: number; // 0.2 = +/- 20%
  random?: () => number; // injectable for tests
}

export function computeBackoffDelay(attempt: number, options: BackoffOptions): number {
  const { baseDelayMs, maxDelayMs, jitter = 0.2, random = Math.random } = options;
  const exponent = Math.max(0, attempt - 1);
  const raw = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  const spread = raw * jitter * (random() * 2 - 1); // between -jitter and +jitter
  return Math.max(0, Math.round(raw + spread));
}