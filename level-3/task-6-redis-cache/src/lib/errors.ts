// An error that carries the HTTP status code it should be reported with.
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: string[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}