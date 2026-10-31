# Task 4: Stateless JWT Authentication & Threat Mitigation

A secure authentication and authorization pipeline built with Express.js and TypeScript: bcrypt password hashing, JWT login, route protection, role-based access control (RBAC), security headers, strict CORS and login rate limiting.

## Run

```
npm install
npm start
```

The server starts on http://localhost:3000. Optional environment variables: `PORT`, `JWT_SECRET`, `ALLOWED_ORIGINS` (comma-separated) and `BCRYPT_ROUNDS`. Without `JWT_SECRET` an insecure development secret is used and a warning is printed.

Demo accounts (created at startup, passwords stored only as bcrypt hashes):

| Username | Password      | Role  |
|----------|---------------|-------|
| admin    | Admin@12345   | ADMIN |
| alice    | Alice@12345   | USER  |

## Endpoints

| Method | Path                | Access          | Description                                 |
|--------|---------------------|-----------------|---------------------------------------------|
| GET    | /health             | public          | Health check                                |
| POST   | /api/auth/register  | public          | Create a USER account (role cannot be chosen) |
| POST   | /api/auth/login     | public, 5/15min | Validate credentials and return a JWT       |
| GET    | /api/profile        | any logged in   | Current user's profile                      |
| GET    | /api/dashboard      | USER or ADMIN   | Example of allowing several roles           |
| GET    | /api/admin/users    | ADMIN only      | List all users                              |

Send the token as `Authorization: Bearer <token>`.

## How it works

- **AuthN (who are you?)**: `authenticateToken` verifies the JWT signature and expiry, then attaches the identity to `req.user`. Missing or invalid tokens get `401`.
- **AuthZ (what may you do?)**: `authorizeRole('ADMIN')` checks `req.user.role`. A valid user with the wrong role gets `403`.
- **JWT**: signed with HS256, 1 hour lifetime, claims `sub` (user id), `username` and `role`. The algorithm is pinned on verification, so forged tokens (for example `alg: none`) are rejected.
- **Passwords**: hashed with bcrypt (cost factor 12, random salt per hash). Plain passwords are never stored or logged, and the hash is never returned to clients.

## Threat mitigation

| Threat                          | Defence                                                                  |
|---------------------------------|--------------------------------------------------------------------------|
| Stolen database                 | bcrypt hashes with salt                                                  |
| Brute-force login               | `express-rate-limit`: max 5 login requests per 15 minutes per IP (`429`) |
| Username enumeration            | One generic error for wrong user or password, plus a dummy hash check so timing matches |
| Privilege escalation            | Registration always assigns `USER`; the role claim is read only from a signed token |
| Token forgery or tampering      | Signature check with a pinned algorithm; expiry check                    |
| Browser attacks / header issues | `helmet` security headers, `X-Powered-By` removed                        |
| Cross-origin abuse              | Strict CORS allow-list (`403` for other origins)                         |
| Oversized payloads              | JSON body limit of 10kb                                                  |

## Screenshots (Thunder Client)

**POST /api/auth/login (200 OK, JWT issued)**

![Login](screenshots/login-200.png)

**GET /api/admin/users as ADMIN (200 OK)**

![Admin access](screenshots/admin-200.png)

**GET /api/profile without a token (401 Unauthorized)**

![No token](screenshots/no-token-401.png)

**GET /api/admin/users as USER (403 Forbidden)**

![Forbidden](screenshots/forbidden-403.png)

**Login rate limit (429 Too Many Requests)**

![Rate limit](screenshots/rate-limit-429.png)

## Concepts covered

Authentication vs. authorization, JWT architecture, password hashing, role-based access control, security headers and rate limiting.


### Task 4: Stateless JWT Authentication & Threat Mitigation

A secure authentication pipeline in Express.js + TypeScript: bcrypt password hashing, JWT login, `authenticateToken` and `authorizeRole` middleware (USER vs ADMIN), Helmet security headers, strict CORS and login rate limiting. Source code: [`level-2/task-4-jwt-auth`](level-2/task-4-jwt-auth)

#### Highlights

- Passwords hashed with bcrypt (salted, cost 12) and never returned to clients
- `/api/auth/login` issues a signed, 1-hour JWT with `sub`, `username` and `role` claims
- `authenticateToken` returns `401` for missing, invalid or expired tokens; `authorizeRole` returns `403` for the wrong role
- Forged tokens (tampered signature, `alg: none`) are rejected because the algorithm is pinned
- Bonus: strict CORS allow-list and a limit of 5 login requests per 15 minutes (`429`)

#### Run

```
cd level-2/task-4-jwt-auth
npm install
npm start
```

#### Screenshots

**Login (200 OK, JWT issued)**

![Login](level-2/task-4-jwt-auth/screenshots/login-200.png)

**Admin route as ADMIN (200 OK)**

![Admin access](level-2/task-4-jwt-auth/screenshots/admin-200.png)

**No token (401 Unauthorized)**

![No token](level-2/task-4-jwt-auth/screenshots/no-token-401.png)

**Admin route as USER (403 Forbidden)**

![Forbidden](level-2/task-4-jwt-auth/screenshots/forbidden-403.png)

**Login rate limit (429 Too Many Requests)**

![Rate limit](level-2/task-4-jwt-auth/screenshots/rate-limit-429.png)

#### Concepts covered

Authentication vs. authorization, JWT architecture, password hashing, role-based access control, security headers and rate limiting.