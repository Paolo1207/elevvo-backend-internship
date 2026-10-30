// Small wrapper around native fetch: timeout, status check and safe JSON parsing.
// It returns `unknown` on purpose, so callers must validate the data before using it.

export class NetworkError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NetworkError';
  }
}

// fetch() wraps the real reason (DNS failure, refused connection...) in `cause`.
function rootMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.cause === undefined ? error.message : rootMessage(error.cause);
  }
  return String(error);
}

export async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    const isTimeout = cause instanceof Error && cause.name === 'TimeoutError';
    const detail = isTimeout ? `timed out after ${timeoutMs}ms` : rootMessage(cause);
    throw new NetworkError(`Network failure: ${detail}`, url, undefined, { cause });
  }

  if (!response.ok) {
    throw new NetworkError(`HTTP ${response.status} ${response.statusText}`.trim(), url, response.status);
  }

  try {
    const body: unknown = await response.json();
    return body;
  } catch (cause) {
    throw new NetworkError('Response was not valid JSON', url, response.status, { cause });
  }
}