// A tiny in-memory imitation of the Redis Streams commands used by StreamConsumer.
// It lets the retry / backoff / Dead Letter Queue logic be tested without a real Redis.
type Fields = Record<string, string>;
interface Entry {
  id: string;
  message: Fields;
}
interface Pending {
  consumer: string;
  deliveries: number;
  lastDelivered: number;
}
interface Group {
  nextIndex: number;
  pending: Map<string, Pending>;
}

export class FakeStreamRedis {
  isOpen = true;
  streams = new Map<string, Entry[]>();
  groups = new Map<string, Group>(); // key: `${stream}|${group}`
  hashes = new Map<string, Map<string, string>>();
  private counter = 0;

  on(): this {
    return this;
  }
  duplicate(): this {
    return this;
  }
  async connect(): Promise<void> {}
  async close(): Promise<void> {}

  private group(stream: string, group: string): Group {
    const key = `${stream}|${group}`;
    let value = this.groups.get(key);
    if (value === undefined) {
      value = { nextIndex: 0, pending: new Map() };
      this.groups.set(key, value);
    }
    return value;
  }

  async xGroupCreate(stream: string, group: string): Promise<void> {
    if (this.groups.has(`${stream}|${group}`)) throw new Error('BUSYGROUP Consumer Group name already exists');
    this.group(stream, group);
    if (!this.streams.has(stream)) this.streams.set(stream, []);
  }

  async xAdd(stream: string, _id: string, message: Fields): Promise<string> {
    const id = `${Date.now()}-${this.counter++}`;
    const entries = this.streams.get(stream) ?? [];
    entries.push({ id, message });
    this.streams.set(stream, entries);
    return id;
  }

  async xReadGroup(group: string, consumer: string, source: { key: string }, options: { COUNT?: number; BLOCK?: number }) {
    const state = this.group(source.key, group);
    const entries = this.streams.get(source.key) ?? [];
    const fresh = entries.slice(state.nextIndex, state.nextIndex + (options.COUNT ?? 10));
    if (fresh.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, options.BLOCK ?? 10));
      return null;
    }
    state.nextIndex += fresh.length;
    for (const entry of fresh) {
      state.pending.set(entry.id, { consumer, deliveries: 1, lastDelivered: Date.now() });
    }
    return [{ name: source.key, messages: fresh }];
  }

  async xPendingRange(stream: string, group: string, start: string) {
    const pending = this.group(stream, group).pending.get(start);
    return pending === undefined ? [] : [{ id: start, consumer: pending.consumer, millisecondsSinceLastDelivery: 0, deliveriesCounter: pending.deliveries }];
  }

  async xClaim(stream: string, group: string, consumer: string, _minIdle: number, id: string) {
    const pending = this.group(stream, group).pending.get(id);
    if (pending === undefined) return [];
    pending.consumer = consumer;
    pending.deliveries += 1;
    pending.lastDelivered = Date.now();
    const entry = (this.streams.get(stream) ?? []).find((candidate) => candidate.id === id);
    return entry === undefined ? [] : [entry];
  }

  async xAutoClaim(stream: string, group: string, consumer: string, minIdle: number) {
    const messages: Entry[] = [];
    for (const [id, pending] of this.group(stream, group).pending) {
      if (Date.now() - pending.lastDelivered >= minIdle) {
        pending.consumer = consumer;
        pending.deliveries += 1;
        pending.lastDelivered = Date.now();
        const entry = (this.streams.get(stream) ?? []).find((candidate) => candidate.id === id);
        if (entry !== undefined) messages.push(entry);
      }
    }
    return { nextId: '0-0', messages, deletedMessages: [] };
  }

  async xAck(stream: string, group: string, id: string): Promise<number> {
    return this.group(stream, group).pending.delete(id) ? 1 : 0;
  }

  async hSet(key: string, field: string, value: string): Promise<number> {
    const hash = this.hashes.get(key) ?? new Map<string, string>();
    hash.set(field, value);
    this.hashes.set(key, hash);
    return 1;
  }
  async hGetAll(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hashes.get(key) ?? []);
  }
  async hDel(key: string, field: string): Promise<number> {
    return this.hashes.get(key)?.delete(field) ? 1 : 0;
  }

  // MULTI/EXEC: queue the commands, run them one after another on exec().
  multi() {
    const queue: (() => Promise<unknown>)[] = [];
    const chain = {
      xAdd: (...args: Parameters<FakeStreamRedis['xAdd']>) => (queue.push(() => this.xAdd(...args)), chain),
      xAck: (...args: Parameters<FakeStreamRedis['xAck']>) => (queue.push(() => this.xAck(...args)), chain),
      hDel: (...args: Parameters<FakeStreamRedis['hDel']>) => (queue.push(() => this.hDel(...args)), chain),
      exec: async () => {
        const results: unknown[] = [];
        for (const run of queue) results.push(await run());
        return results;
      },
    };
    return chain;
  }

  // ---- helpers for assertions ----
  entries(stream: string): Entry[] {
    return this.streams.get(stream) ?? [];
  }
  pendingCount(stream: string, group: string): number {
    return this.group(stream, group).pending.size;
  }
  // Simulates a worker that received an event and then died before acknowledging it.
  takeWithoutAck(stream: string, group: string, consumer: string): void {
    const state = this.group(stream, group);
    const entry = (this.streams.get(stream) ?? [])[state.nextIndex];
    if (entry === undefined) return;
    state.nextIndex += 1;
    state.pending.set(entry.id, { consumer, deliveries: 1, lastDelivered: Date.now() });
  }
  setDeliveries(stream: string, group: string, id: string, deliveries: number): void {
    const pending = this.group(stream, group).pending.get(id);
    if (pending !== undefined) pending.deliveries = deliveries;
  }
}