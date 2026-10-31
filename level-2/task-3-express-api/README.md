# Task 3: Observability & Modular Express API Architecture

A structured Express.js API written in TypeScript. Code is split into Routes, Controllers and Services, with a global observability middleware and an API key security middleware.

## Architecture

```
src/
├── routes/         Maps URL + HTTP method to a controller (no logic)
├── controllers/    Reads the request, validates input, sends the response
├── services/       Business logic and in-memory data (knows nothing about HTTP)
├── middleware/
│   ├── observability.ts   Logs every request (global)
│   ├── requireAPIKey.ts   Checks x-api-key (bonus)
│   └── errorHandlers.ts   404 and error handling
├── types/          TypeScript interfaces
├── app.ts          Builds the Express app and middleware pipeline
└── server.ts       Starts the server
```

Request flow: `observability` -> `express.json()` -> `requireAPIKey` -> route -> controller -> service.

## Run

```
npm install
npm start
```

The server starts on http://localhost:3000. Use `npm run dev` for auto-restart while developing, and set the `PORT` or `API_KEY` environment variables to override the defaults. The default API key is `secret-key-123`.

## Endpoints

| Method | Path             | Auth    | Success         | Errors                  |
|--------|------------------|---------|-----------------|-------------------------|
| GET    | /health          | none    | 200             |                         |
| GET    | /api/users       | API key | 200             | 401                     |
| GET    | /api/users/:id   | API key | 200             | 400, 401, 404           |
| POST   | /api/users       | API key | 201 Created     | 400, 401, 409           |
| PUT    | /api/users/:id   | API key | 200             | 400, 401, 404, 409      |
| DELETE | /api/users/:id   | API key | 204 No Content  | 400, 401, 404           |

Errors are always JSON, for example `{"error":"Unauthorized","message":"A valid x-api-key header is required"}`.

## Observability middleware

Every request is logged with its ISO timestamp, HTTP method, path, status code and processing time in milliseconds, including rejected (401) and unknown (404) requests:

```
[2026-10-31T05:27:28.620Z] PUT /api/users/3 -> 200 0.79ms
```

![Observability logs](screenshots/observability-logs.png)

## Bonus: requireAPIKey middleware

Requests to `/api` without a valid `x-api-key` header get a `401 Unauthorized` JSON response. The key is compared in constant time.

![401 Unauthorized](screenshots/unauthorized-401.png)

## Screenshots (Thunder Client)

**GET /api/users (200 OK)**

![List users](screenshots/list-200.png)

**POST /api/users (201 Created)**

![Create user](screenshots/create-201.png)

## Concepts covered

Express framework, modular routing, custom middleware pipelines, controller-service pattern, observability logging.