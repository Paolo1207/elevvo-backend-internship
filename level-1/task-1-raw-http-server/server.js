// Task 1: Raw HTTP server using only Node's built-in `http` module (no frameworks).
const http = require('http');
const os = require('os');

const PORT = process.env.PORT || 3000;

const users = [
  { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 2, name: 'Alan Turing', email: 'alan@example.com' },
  { id: 3, name: 'Grace Hopper', email: 'grace@example.com' },
];

// Send a JSON response with strict headers.
function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

// Route table: path -> { METHOD: handler }
const routes = {
  '/': {
    GET: (req, res) =>
      sendJson(res, 200, {
        message: 'Welcome to the raw Node.js HTTP server',
        endpoints: ['GET /', 'GET /api/users', 'GET /api/health'],
      }),
  },
  '/api/users': {
    GET: (req, res) => sendJson(res, 200, { count: users.length, data: users }),
  },
  // Bonus: health check
  '/api/health': {
    GET: (req, res) =>
      sendJson(res, 200, {
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime() * 100) / 100,
        platform: os.platform(),
        timestamp: new Date().toISOString(),
      }),
  },
};

const server = http.createServer((req, res) => {
  const started = process.hrtime.bigint();

  // Request inspector: log method, URL, status and key headers once the response finishes.
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(
      `${new Date().toISOString()} ${req.method} ${req.url} -> ${res.statusCode} (${ms.toFixed(2)}ms)` +
        ` | UA: ${req.headers['user-agent'] || '-'} | Accept: ${req.headers['accept'] || '-'}`
    );
  });

  // Strip the query string for routing.
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = routes[pathname];

  if (!route) {
    return sendJson(res, 404, { error: 'Not Found', path: pathname });
  }

  const handler = route[req.method];
  if (!handler) {
    return sendJson(
      res,
      405,
      { error: 'Method Not Allowed', allowed: Object.keys(route) },
      { Allow: Object.keys(route).join(', ') }
    );
  }

  try {
    handler(req, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});