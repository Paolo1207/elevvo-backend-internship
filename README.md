# Elevvo Backend Internship

Backend development tasks completed during the internship.

## Level 1

# Task 1: Web Request Inspector & Raw HTTP Server

A raw Node.js HTTP server built with only the built-in `http` module (no Express or other frameworks).

## Run

```
node server.js
```

The server starts on http://localhost:3000. Set a different port with the `PORT` environment variable.

## Endpoints

| Method | Path          | Status        | Description                                   |
|--------|---------------|---------------|-----------------------------------------------|
| GET    | /             | 200 OK        | Welcome message and list of endpoints         |
| GET    | /api/users    | 200 OK        | List of sample users                          |
| GET    | /api/health   | 200 OK        | Uptime, OS platform and ISO timestamp (bonus) |
| any    | unknown path  | 404 Not Found | JSON error                                    |
| other  | known path    | 405           | Method not allowed, with an `Allow` header    |

All responses use `Content-Type: application/json`.

## Test with cURL

```
curl -i http://localhost:3000/
curl -i http://localhost:3000/api/users
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/nope
```

## Screenshots

Add your DevTools Network tab and Postman screenshots here.
## Screenshots

### GET / (200 OK)
![GET /](screenshots/root-200png.png)

### GET /api/users (200 OK)
![GET /api/users](screenshots/users-200png.png)

### GET /api/health (200 OK, bonus)
![GET /api/health](screenshots/health-200png.png)

### GET /nope (404 Not Found)
![404 Not Found](screenshots/404notfound.png)
## Concepts covered

HTTP lifecycle, client-server architecture, status codes, JSON payloads, native Node routing.