import { computeBackoffDelay } from '../../src/messaging/backoff';

const noJitter = { baseDelayMs: 1000, maxDelayMs: 30_000, jitter: 0 };

describe('computeBackoffDelay (exponential backoff)', () => {
  it('doubles the delay after every failed attempt', () => {
    expect([1, 2, 3, 4, 5].map((attempt) => computeBackoffDelay(attempt, noJitter))).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('never exceeds the maximum delay', () => {
    expect(computeBackoffDelay(6, noJitter)).toBe(30_000);
    expect(computeBackoffDelay(50, noJitter)).toBe(30_000);
  });

  it('adds jitter of at most +/- 20% around the delay', () => {
    const low = computeBackoffDelay(3, { baseDelayMs: 1000, maxDelayMs: 30_000, random: () => 0 });
    const high = computeBackoffDelay(3, { baseDelayMs: 1000, maxDelayMs: 30_000, random: () => 1 });
    const middle = computeBackoffDelay(3, { baseDelayMs: 1000, maxDelayMs: 30_000, random: () => 0.5 });
    expect(low).toBe(3200);
    expect(high).toBe(4800);
    expect(middle).toBe(4000);
  });

  it('treats attempt 0 like attempt 1 and never returns a negative delay', () => {
    expect(computeBackoffDelay(0, noJitter)).toBe(1000);
    expect(computeBackoffDelay(1, { baseDelayMs: 10, maxDelayMs: 10, jitter: 5, random: () => 0 })).toBe(0);
  });

  it('uses Math.random by default', () => {
    const delay = computeBackoffDelay(1, { baseDelayMs: 1000, maxDelayMs: 30_000 });
    expect(delay).toBeGreaterThanOrEqual(800);
    expect(delay).toBeLessThanOrEqual(1200);
  });
});