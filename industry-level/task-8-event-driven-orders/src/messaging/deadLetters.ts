// OPERATIONS on the Dead Letter Queue: look at it, replay events after a fix, discard them, and read queue stats.
import { redis } from '../lib/redis';
import { AppError } from '../lib/errors';
import { parseEvent } from './events';
import { topology } from './topology';
import { publishEvent } from './publisher';

export interface DeadLetter {
  id: string;
  group: string;
  error: string;
  attempts: number;
  failedAt: string;
  originalStreamId: string;
  payload: unknown;
}

function toDeadLetter(entry: { id: string; message: Record<string, string> }): DeadLetter {
  const raw = entry.message['payload'] ?? '';
  let payload: unknown = raw;
  try {
    payload = JSON.parse(raw);
  } catch {
    // keep the raw text: malformed payloads are exactly why some events end up here
  }
  return {
    id: entry.id,
    group: entry.message['group'] ?? 'unknown',
    error: entry.message['error'] ?? '',
    attempts: Number(entry.message['attempts'] ?? 0),
    failedAt: entry.message['failedAt'] ?? '',
    originalStreamId: entry.message['originalStreamId'] ?? '',
    payload,
  };
}

export async function listDeadLetters(limit = 50): Promise<DeadLetter[]> {
  const entries = await redis.xRevRange(topology.deadLetterStream, '+', '-', { COUNT: limit });
  return (entries ?? []).map(toDeadLetter);
}

async function getEntry(id: string) {
  const entries = await redis.xRange(topology.deadLetterStream, id, id);
  const entry = entries?.[0];
  if (entry === undefined) throw new AppError(404, `Dead letter ${id} not found`);
  return entry;
}

// Puts a dead letter back on the main stream so that ONLY the group that failed handles it again.
// Use it after fixing the cause (for example the email service is back up).
export async function replayDeadLetter(id: string): Promise<{ replayedAs: string; group: string }> {
  const entry = await getEntry(id);
  const group = entry.message['group'] ?? '';

  let event;
  try {
    event = parseEvent(entry.message['payload']);
  } catch (error) {
    throw new AppError(422, `This dead letter cannot be replayed: ${error instanceof Error ? error.message : 'invalid event'}`);
  }

  const replayedAs = await publishEvent({ ...event, targetGroup: group, replayOf: id });
  await redis.xDel(topology.deadLetterStream, id);
  return { replayedAs, group };
}

export async function deleteDeadLetter(id: string): Promise<void> {
  await getEntry(id);
  await redis.xDel(topology.deadLetterStream, id);
}

export async function queueStats() {
  const groups: Record<string, { consumers: number; pending: number; lag: number | null; retryWaiting: number }> = {};

  let streamLength = 0;
  try {
    streamLength = await redis.xLen(topology.stream);
    for (const group of await redis.xInfoGroups(topology.stream)) {
      groups[group.name] = {
        consumers: group.consumers,
        pending: group.pending,
        lag: typeof group.lag === 'number' ? group.lag : null,
        retryWaiting: await redis.hLen(topology.retryKey(group.name)),
      };
    }
  } catch {
    // the stream does not exist yet: nothing has been published
  }

  return {
    stream: topology.stream,
    streamLength,
    deadLetterQueue: { stream: topology.deadLetterStream, length: await redis.xLen(topology.deadLetterStream) },
    groups,
  };
}