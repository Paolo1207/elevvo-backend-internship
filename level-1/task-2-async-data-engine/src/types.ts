// Domain interfaces: the strict shapes the rest of the app works with.
export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  city: string;
  company: string;
}

export interface Post {
  id: number;
  userId: number;
  title: string;
  body: string;
}

export interface Todo {
  id: number;
  userId: number;
  title: string;
  completed: boolean;
}

// A data source: where to fetch from, and how to turn raw JSON into domain objects.
export interface Source<T> {
  name: string;
  url: string;
  map: (raw: unknown) => T[];
}

// A failure that was isolated so the other sources could keep going.
export interface SourceError {
  source: string;
  url: string;
  message: string;
}

export interface EngineResult {
  users: User[];
  posts: Post[];
  todos: Todo[];
  errors: SourceError[];
  durationMs: number;
}

export interface EngineOptions {
  // Suppress console logging (used by the benchmark).
  quiet?: boolean;
  // Add deliberately broken sources to prove that failures are isolated.
  simulateFailures?: boolean;
}