// END-TO-END SMOKE TEST against a RUNNING API (local, CI container, staging or production).
//   BASE_URL=https://shop-api-staging.onrender.com SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... npm run smoke
// It walks through the real user journey: register -> login -> RBAC checks -> cart -> atomic checkout -> search -> deep health.
// Without admin credentials only the customer steps run.
const BASE_URL = (process.env['BASE_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_EMAIL = process.env['SMOKE_ADMIN_EMAIL'];
const ADMIN_PASSWORD = process.env['SMOKE_ADMIN_PASSWORD'];
const REQUIRE_SEARCH = process.env['SMOKE_REQUIRE_SEARCH'] === 'true';

interface Reply {
  status: number;
  headers: Headers;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

let failures = 0;
let step = 0;

async function call(method: string, path: string, options: { token?: string; body?: unknown } = {}): Promise<Reply> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
      ...(options.token !== undefined && { Authorization: `Bearer ${options.token}` }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, headers: response.headers, body };
}

function check(name: string, ok: boolean, detail = ''): void {
  step += 1;
  if (ok) {
    console.log(`  PASS ${String(step).padStart(2, '0')} ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${String(step).padStart(2, '0')} ${name} ${detail}`);
  }
}

async function waitForApi(): Promise<void> {
  // A free Render instance sleeps when idle and needs up to a minute to wake up.
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const reply = await call('GET', '/health');
      if (reply.status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`${BASE_URL}/health did not answer 200 within 200 seconds`);
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE_URL}`);
  await waitForApi();

  const health = await call('GET', '/health');
  check('GET /health is ok', health.status === 200 && health.body.status === 'ok', JSON.stringify(health.body));
  console.log(`       version=${health.body.version} redis=${health.body.redis} embeddings=${health.body.embeddings}`);

  const anonymous = await call('GET', '/api/orders');
  check('anonymous GET /api/orders -> 401', anonymous.status === 401);

  const email = `smoke+${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@example.com`;
  const password = 'Smoke-Test-123';
  const registered = await call('POST', '/api/auth/register', { body: { email, name: 'Smoke Test', password } });
  check('register -> 201 with role CUSTOMER and no password hash', registered.status === 201 && registered.body.data?.role === 'CUSTOMER' && registered.body.data?.passwordHash === undefined, JSON.stringify(registered.body));

  const duplicate = await call('POST', '/api/auth/register', { body: { email, name: 'Smoke Test', password } });
  check('registering the same e-mail again -> 409', duplicate.status === 409);

  const wrong = await call('POST', '/api/auth/login', { body: { email, password: 'wrong-password' } });
  check('login with wrong password -> 401', wrong.status === 401);

  const login = await call('POST', '/api/auth/login', { body: { email, password } });
  const customerToken: string = login.body.token;
  check('login -> 200 with a JWT', login.status === 200 && typeof customerToken === 'string' && customerToken.split('.').length === 3);

  const me = await call('GET', '/api/auth/me', { token: customerToken });
  check('GET /api/auth/me -> own profile', me.status === 200 && me.body.data?.email === email);

  const forged = await call('GET', '/api/auth/me', { token: `${customerToken.slice(0, -4)}AAAA` });
  check('tampered token -> 401', forged.status === 401);

  const forbiddenCreate = await call('POST', '/api/products', { token: customerToken, body: { name: 'x', price: '1.00', stock: 1 } });
  check('CUSTOMER cannot create a product -> 403', forbiddenCreate.status === 403);
  const forbiddenUsers = await call('GET', '/api/users', { token: customerToken });
  check('CUSTOMER cannot list users -> 403', forbiddenUsers.status === 403);
  const forbiddenHealth = await call('GET', '/health/deep', { token: customerToken });
  check('CUSTOMER cannot read /health/deep -> 403', forbiddenHealth.status === 403);
  const anonymousHealth = await call('GET', '/health/deep');
  check('anonymous /health/deep -> 401', anonymousHealth.status === 401);

  const first = await call('GET', '/api/products?limit=5');
  const second = await call('GET', '/api/products?limit=5');
  check('GET /api/products is public', first.status === 200 && Array.isArray(first.body.data));
  console.log(`       cache: first=${first.headers.get('x-cache')} second=${second.headers.get('x-cache')}`);

  const search = await call('GET', `/api/products/search?q=${encodeURIComponent('something to keep me warm')}&limit=3`);
  check(
    REQUIRE_SEARCH ? 'semantic search -> 200' : 'semantic search -> 200 (or 503 while the model warms up)',
    search.status === 200 || (!REQUIRE_SEARCH && search.status === 503),
    `status ${search.status} ${JSON.stringify(search.body).slice(0, 200)}`,
  );

  if (ADMIN_EMAIL === undefined || ADMIN_PASSWORD === undefined) {
    console.log('  (no SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD: admin steps skipped)');
  } else {
    const adminLogin = await call('POST', '/api/auth/login', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    const adminToken: string = adminLogin.body.token;
    check('admin login -> 200 and role ADMIN', adminLogin.status === 200 && adminLogin.body.user?.role === 'ADMIN', `status ${adminLogin.status}`);

    const product = await call('POST', '/api/products', {
      token: adminToken,
      body: { name: `[smoke] Test item ${Date.now().toString(36)}`, description: 'Created by the smoke test', price: '2.50', stock: 5 },
    });
    const productId: number = product.body.data?.id;
    check('ADMIN creates a product -> 201', product.status === 201 && Number.isInteger(productId), `status ${product.status}`);

    // --- cart + atomic checkout ---
    const addOk = await call('PUT', '/api/cart/items', { token: customerToken, body: { productId, quantity: 2 } });
    check('add 2 to cart -> total 5', addOk.status === 200 && Number(addOk.body.data?.total) === 5, JSON.stringify(addOk.body).slice(0, 200));

    await call('PUT', '/api/cart/items', { token: customerToken, body: { productId, quantity: 99 } });
    const tooMany = await call('POST', '/api/cart/checkout', { token: customerToken });
    check('checkout with more than the stock -> 409 (rolled back)', tooMany.status === 409, `status ${tooMany.status}`);
    const cartAfterFail = await call('GET', '/api/cart', { token: customerToken });
    check('failed checkout left the cart untouched', cartAfterFail.body.data?.items?.[0]?.quantity === 99);
    const stockAfterFail = await call('GET', `/api/products/${productId}`);
    check('failed checkout did not change the stock (still 5)', stockAfterFail.body.data?.stock === 5, JSON.stringify(stockAfterFail.body).slice(0, 200));

    await call('PUT', '/api/cart/items', { token: customerToken, body: { productId, quantity: 2 } });
    const order = await call('POST', '/api/cart/checkout', { token: customerToken });
    check('checkout -> 201, total 5', order.status === 201 && Number(order.body.data?.total) === 5, `status ${order.status}`);
    const stockAfter = await call('GET', `/api/products/${productId}`);
    check('stock went from 5 to 3 and the cache was invalidated', stockAfter.body.data?.stock === 3, JSON.stringify(stockAfter.body).slice(0, 200));
    const emptyCart = await call('GET', '/api/cart', { token: customerToken });
    check('cart is empty after checkout', emptyCart.body.data?.items?.length === 0);
    const again = await call('POST', '/api/cart/checkout', { token: customerToken });
    check('checking out an empty cart -> 400', again.status === 400);

    const myOrders = await call('GET', '/api/orders', { token: customerToken });
    check('CUSTOMER sees only their own order', myOrders.status === 200 && myOrders.body.data?.length === 1);
    const allOrders = await call('GET', '/api/orders?limit=5', { token: adminToken });
    check('ADMIN sees orders of everyone', allOrders.status === 200 && allOrders.body.data?.length >= 1);

    // --- bonus: deep health ---
    const deep = await call('GET', '/health/deep', { token: adminToken });
    const d = deep.body;
    check(
      '/health/deep -> V8 memory, PostgreSQL pool and Redis latency',
      deep.status === 200 && typeof d.memory?.heapUsedMb === 'number' && typeof d.postgres?.pool?.total === 'number' && typeof d.redis?.latencyMs === 'number',
      JSON.stringify(d).slice(0, 300),
    );
    console.log(`       status=${d.status} heap=${d.memory?.heapUsedMb}/${d.memory?.heapLimitMb}MB pool=${JSON.stringify(d.postgres?.pool)} redis=${d.redis?.latencyMs}ms`);

    // Keep production tidy: the smoke product stays (order history references it) but is taken off sale.
    await call('PUT', `/api/products/${productId}`, { token: adminToken, body: { stock: 0 } });
  }

  console.log(failures === 0 ? `\nSMOKE TEST PASSED (${step} checks)` : `\nSMOKE TEST FAILED (${failures} of ${step} checks)`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
