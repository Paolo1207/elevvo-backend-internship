// FAILURE INJECTION, to demonstrate retries and the Dead Letter Queue on demand.
//
// Setting "chaos:email" in Redis makes the (simulated) email service fail. Two modes:
//   "always"  -> every call fails until you switch it off
//   "3"       -> the next 3 calls fail, then it works again (shows retry + recovery)
import { redis } from '../lib/redis';
import { RetryableError } from './errors';
import { topology } from './topology';

export const chaosServices = ['email', 'inventory'] as const;
export type ChaosService = (typeof chaosServices)[number];

export function isChaosService(value: unknown): value is ChaosService {
  return typeof value === 'string' && (chaosServices as readonly string[]).includes(value);
}

// Called by the handlers right before they talk to the "external service".
export async function maybeInjectFailure(service: ChaosService): Promise<void> {
  let setting: string | null;
  try {
    setting = await redis.get(topology.chaosKey(service));
  } catch {
    return; // never let the demo switch break real processing
  }
  if (setting === null) return;

  if (setting === 'always') {
    throw new RetryableError(`Injected failure: ${service} service is unavailable`);
  }

  const left = await redis.decr(topology.chaosKey(service));
  if (left >= 0) {
    throw new RetryableError(`Injected failure: ${service} service is unavailable`);
  }
  await redis.del(topology.chaosKey(service));
}

// mode: "always" | a number of failures | "off"
export async function setChaos(service: ChaosService, mode: 'always' | 'off' | number): Promise<void> {
  const key = topology.chaosKey(service);
  if (mode === 'off') {
    await redis.del(key);
    return;
  }
  // The flag expires by itself after 10 minutes, so a forgotten switch cannot break things forever.
  await redis.set(key, String(mode), { EX: 600 });
}

export async function getChaos(): Promise<Record<ChaosService, string>> {
  const result = { email: 'off', inventory: 'off' } as Record<ChaosService, string>;
  for (const service of chaosServices) {
    result[service] = (await redis.get(topology.chaosKey(service))) ?? 'off';
  }
  return result;
}