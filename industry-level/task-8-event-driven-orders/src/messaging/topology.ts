// Names of everything we create in Redis for the order pipeline, in one place.
export const topology = {
  // The main event stream. Every OrderCreated event is appended here by the API.
  stream: 'orders.events',
  // Dead Letter Queue: events that could not be processed are parked here for a human.
  deadLetterStream: 'orders.events.dlq',
  // One consumer GROUP per independent subscriber service.
  // Every group receives EVERY event (pub/sub fan-out).
  // Workers inside the SAME group share the events between them (horizontal scaling).
  groups: {
    inventory: 'inventory',
    email: 'email',
  },
  // Hash that remembers when each failed message may be retried: retry:<group> { streamId -> json }.
  retryKey: (group: string): string => `orders.retry:${group}`,
  // Failure injection flags used to demo retries: chaos:email, chaos:inventory.
  chaosKey: (service: string): string => `chaos:${service}`,
} as const;

export type GroupName = (typeof topology.groups)[keyof typeof topology.groups];