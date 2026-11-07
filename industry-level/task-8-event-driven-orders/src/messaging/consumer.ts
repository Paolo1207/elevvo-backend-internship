// STREAM CONSUMER: the reusable engine behind every worker.
//
// It reads events for ONE consumer group and gives each one to a handler. It guarantees:
//
//   * AT-LEAST-ONCE delivery: an event is only removed from the "pending" list (XACK) after the handler
//     succeeded. If the worker crashes mid-way, another worker takes the event over (crash recovery).
//   * RETRY with EXPONENTIAL BACKOFF: when the handler throws, the event is retried later, waiting
//     longer after every failure (1s, 2s, 4s, 8s ...).
//   * DEAD LETTER QUEUE: events that are malformed, or still failing after maxAttempts, are moved to a
//     separate stream instead of being lost or retried forever.
//
// Because delivery is "at least once", handlers MUST be idempotent (safe to run twice for the same event).
import { hostname } from 'node:os';
import { redis } from '../lib/redis';
import { computeBackoffDelay } from './backoff';
import { NonRetryableError } from './errors';
import { parseEvent } from './events';
import type { OrderCreatedEvent } from './events';
import { topology } from './topology';

type RedisClient = typeof redis;

export interface HandlerContext {
  group: string;
  streamId: string;
  attempt: number; // 1 = first try
}

export type EventHandler = (event: OrderCreatedEvent, context: HandlerContext) => Promise<void>;

export interface ConsumerOptions {
  group: string;
  handler: EventHandler;
  client?: RedisClient; // normal commands
  readerClient?: RedisClient; // dedicated connection for the blocking read
  consumerName?: string;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  visibilityTimeoutMs: number;
  blockMs?: number;
  retryPollMs?: number;
  recoveryPollMs?: number;
  random?: () => number;
  log?: (message: string) => void;
}

interface RetryMeta {
  dueAt: number;
  attempt: number;
  error: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class StreamConsumer {
  private readonly client: RedisClient;
  private readonly reader: RedisClient;
  private readonly ownsReader: boolean;
  private readonly name: string;
  private readonly blockMs: number;
  private readonly retryPollMs: number;
  private readonly recoveryPollMs: number;
  private readonly log: (message: string) => void;
  private running = false;
  private loops: Promise<void>[] = [];

  constructor(private readonly options: ConsumerOptions) {
    this.client = options.client ?? redis;
    // XREADGROUP ... BLOCK holds its connection open while waiting, so it gets its OWN connection.
    // Otherwise it would stall every other command on the shared client.
    this.ownsReader = options.readerClient === undefined;
    this.reader = options.readerClient ?? this.client.duplicate();
    this.name = options.consumerName ?? `${options.group}-${hostname()}-${process.pid}`;
    // node-redis emits "error" events when the connection drops. With no listener Node would CRASH the
    // whole worker, so we log them instead and let the client reconnect by itself.
    if (this.ownsReader) {
      let lastLog = 0;
      this.reader.on('error', (error: Error) => {
        if (Date.now() - lastLog > 10_000) {
          lastLog = Date.now();
          console.warn(`[${this.name}] reader connection problem: ${error.message || 'unknown'}`);
        }
      });
    }
    this.blockMs = options.blockMs ?? 2000;
    this.retryPollMs = options.retryPollMs ?? 500;
    this.recoveryPollMs = options.recoveryPollMs ?? Math.max(1000, Math.floor(options.visibilityTimeoutMs / 4));
    this.log = options.log ?? ((message) => console.log(`[${this.name}] ${message}`));
  }

  get consumerName(): string {
    return this.name;
  }

  async start(): Promise<void> {
    this.running = true;
    if (this.ownsReader && !this.reader.isOpen) {
      await this.reader.connect();
    }
    await this.ensureGroup();
    this.loops = [this.readLoop(), this.retryLoop(), this.recoveryLoop()];
    this.log(`consuming "${topology.stream}" as group "${this.options.group}"`);
  }

  // Graceful shutdown: stop taking new events, let the current one finish, then disconnect.
  async stop(): Promise<void> {
    this.running = false;
    await Promise.allSettled(this.loops);
    if (this.ownsReader && this.reader.isOpen) {
      await this.reader.close();
    }
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.client.xGroupCreate(topology.stream, this.options.group, '0', { MKSTREAM: true });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error;
    }
  }

  // ---- Loop 1: read NEW events --------------------------------------------------------------
  private async readLoop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.reader.xReadGroup(
          this.options.group,
          this.name,
          { key: topology.stream, id: '>' }, // ">" = only events never delivered to this group
          { COUNT: 10, BLOCK: this.blockMs },
        );
        if (result === null) continue; // nothing arrived before the block timeout
        for (const stream of result) {
          for (const entry of stream.messages) {
            await this.process(entry.id, entry.message);
          }
        }
      } catch (error) {
        if (!this.running) break;
        this.log(`read failed: ${messageOf(error)}`);
        if (messageOf(error).includes('NOGROUP')) {
          await this.ensureGroup().catch(() => undefined);
        }
        await sleep(1000); // Redis is probably down: wait and try again, never crash
      }
    }
  }

  // ---- Loop 2: retry events whose backoff delay has passed -----------------------------------
  private async retryLoop(): Promise<void> {
    const retryKey = topology.retryKey(this.options.group);
    while (this.running) {
      await sleep(this.retryPollMs);
      if (!this.running) break;
      try {
        const waiting = await this.client.hGetAll(retryKey);
        const now = Date.now();
        for (const [streamId, raw] of Object.entries(waiting)) {
          let meta: RetryMeta;
          try {
            meta = JSON.parse(raw) as RetryMeta;
          } catch {
            await this.client.hDel(retryKey, streamId);
            continue;
          }
          if (meta.dueAt > now) continue;

          // Several workers in the same group run this loop. HDEL returns 1 for exactly ONE of them,
          // so only that worker retries the event.
          if ((await this.client.hDel(retryKey, streamId)) !== 1) continue;

          // Take ownership of the pending event (also bumps its delivery counter = attempt number).
          const claimed = await this.client.xClaim(topology.stream, this.options.group, this.name, 0, streamId);
          for (const entry of claimed) {
            if (entry !== null) await this.process(entry.id, entry.message);
          }
        }
      } catch (error) {
        this.log(`retry loop failed: ${messageOf(error)}`);
      }
    }
  }

  // ---- Loop 3: crash recovery ----------------------------------------------------------------
  // Events that a worker received but never acknowledged (it crashed or hung) become "idle".
  // After visibilityTimeoutMs another worker takes them over with XAUTOCLAIM.
  private async recoveryLoop(): Promise<void> {
    while (this.running) {
      await sleep(this.recoveryPollMs);
      if (!this.running) break;
      try {
        let cursor = '0-0';
        do {
          const result = await this.client.xAutoClaim(
            topology.stream,
            this.options.group,
            this.name,
            this.options.visibilityTimeoutMs,
            cursor,
            { COUNT: 10 },
          );
          cursor = result.nextId;
          for (const entry of result.messages) {
            if (entry === null) continue;
            this.log(`recovered abandoned event ${entry.id}`);
            await this.process(entry.id, entry.message);
          }
        } while (cursor !== '0-0' && this.running);
      } catch (error) {
        this.log(`recovery loop failed: ${messageOf(error)}`);
      }
    }
  }

  // ---- Handling one event --------------------------------------------------------------------
  private async process(streamId: string, fields: Record<string, string>): Promise<void> {
    try {
      const attempt = await this.deliveryCount(streamId);
      if (attempt === 0) return; // already acknowledged by someone else

      // Crash-loop protection: an event that keeps killing workers eventually stops being delivered.
      if (attempt > this.options.maxAttempts) {
        await this.deadLetter(streamId, fields, `Exceeded ${this.options.maxAttempts} deliveries`, attempt);
        return;
      }

      let event: OrderCreatedEvent;
      try {
        event = parseEvent(fields['payload']);
      } catch (error) {
        await this.deadLetter(streamId, fields, messageOf(error), attempt);
        return;
      }

      // A replayed dead letter is meant for ONE group only. Everybody else just acknowledges it.
      if (event.targetGroup !== undefined && event.targetGroup !== this.options.group) {
        await this.acknowledge(streamId);
        return;
      }

      try {
        await this.options.handler(event, { group: this.options.group, streamId, attempt });
      } catch (error) {
        await this.handleFailure(streamId, fields, error, attempt);
        return;
      }
      await this.acknowledge(streamId);
      this.log(`handled event ${streamId} (attempt ${attempt})`);
    } catch (error) {
      // Redis itself failed while we were bookkeeping. The event stays pending and crash recovery
      // will pick it up later, so nothing is lost.
      this.log(`could not finish event ${streamId}: ${messageOf(error)}`);
    }
  }

  private async deliveryCount(streamId: string): Promise<number> {
    const pending = await this.client.xPendingRange(topology.stream, this.options.group, streamId, streamId, 1);
    return pending[0]?.deliveriesCounter ?? 0;
  }

  private async acknowledge(streamId: string): Promise<void> {
    await this.client.multi().xAck(topology.stream, this.options.group, streamId).hDel(
      topology.retryKey(this.options.group),
      streamId,
    ).exec();
  }

  private async handleFailure(
    streamId: string,
    fields: Record<string, string>,
    error: unknown,
    attempt: number,
  ): Promise<void> {
    const reason = messageOf(error);

    if (error instanceof NonRetryableError) {
      this.log(`event ${streamId} failed permanently: ${reason}`);
      await this.deadLetter(streamId, fields, reason, attempt);
      return;
    }

    if (attempt >= this.options.maxAttempts) {
      this.log(`event ${streamId} failed ${attempt} times, moving to the DLQ: ${reason}`);
      await this.deadLetter(streamId, fields, reason, attempt);
      return;
    }

    const delay = computeBackoffDelay(attempt, {
      baseDelayMs: this.options.baseDelayMs,
      maxDelayMs: this.options.maxDelayMs,
      ...(this.options.random !== undefined ? { random: this.options.random } : {}),
    });
    const meta: RetryMeta = { dueAt: Date.now() + delay, attempt, error: reason };
    // The event stays in the pending list (not acknowledged), so it cannot be lost while it waits.
    await this.client.hSet(topology.retryKey(this.options.group), streamId, JSON.stringify(meta));
    this.log(`event ${streamId} failed (attempt ${attempt}/${this.options.maxAttempts}): ${reason}. Retry in ${delay} ms`);
  }

  // Copy to the DLQ and acknowledge the original as ONE atomic transaction (MULTI/EXEC):
  // the event can never be in both places, and never in neither.
  private async deadLetter(
    streamId: string,
    fields: Record<string, string>,
    reason: string,
    attempts: number,
  ): Promise<void> {
    await this.client
      .multi()
      .xAdd(topology.deadLetterStream, '*', {
        payload: fields['payload'] ?? '',
        group: this.options.group,
        originalStreamId: streamId,
        error: reason,
        attempts: String(attempts),
        failedAt: new Date().toISOString(),
      })
      .xAck(topology.stream, this.options.group, streamId)
      .hDel(topology.retryKey(this.options.group), streamId)
      .exec();
    this.log(`event ${streamId} -> dead letter queue (${reason})`);
  }
}