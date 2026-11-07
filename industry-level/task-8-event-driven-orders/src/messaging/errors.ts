// A failure that will never succeed no matter how often it is retried (for example a malformed message).
// The consumer sends these straight to the Dead Letter Queue instead of wasting retries.
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}

// A temporary failure (service down, timeout, deadlock...). The consumer retries these with backoff.
export class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}