// The public API endpoints the engine queries (JSONPlaceholder).
import { mapArray, mapPost, mapTodo, mapUser } from './mappers';
import type { Post, Source, Todo, User } from './types';

const BASE_URL = 'https://jsonplaceholder.typicode.com';

export const usersSource: Source<User> = {
  name: 'users',
  url: `${BASE_URL}/users`,
  map: (raw) => mapArray(raw, mapUser),
};

export const postsSource: Source<Post> = {
  name: 'posts',
  url: `${BASE_URL}/posts`,
  map: (raw) => mapArray(raw, mapPost),
};

export const todosSource: Source<Todo> = {
  name: 'todos',
  url: `${BASE_URL}/todos`,
  map: (raw) => mapArray(raw, mapTodo),
};

// Deliberately broken sources, used only to demonstrate error isolation.
export const demoFailureSources: Source<Post>[] = [
  {
    name: 'missing-endpoint (demo: HTTP 404)',
    url: `${BASE_URL}/this-route-does-not-exist`,
    map: (raw) => mapArray(raw, mapPost),
  },
  {
    name: 'unreachable-host (demo: network failure)',
    // The .invalid top-level domain is reserved and can never resolve.
    url: 'https://this-host-does-not-exist.invalid/posts',
    map: (raw) => mapArray(raw, mapPost),
  },
];