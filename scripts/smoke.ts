/**
 * End-to-end smoke test against a running stack (docker compose up). Exits 1 on the first failed check.
 *   npm run smoke                     # BASE_URL defaults to http://localhost:3000
 *   MAILPIT_URL=http://localhost:8025 npm run smoke
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const API = `${BASE_URL}/api/v1`;
const RUN = Date.now().toString(36);

interface Res {
  status: number;
  headers: Headers;
  body: {
    statusCode?: number;
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown[];
    // Assertions read deep, response-specific fields; typing each one adds nothing to a test script.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
  };
  text: string;
}

interface Opts {
  token?: string;
  body?: unknown;
  device?: string;
  lang?: string;
  headers?: Record<string, string>;
  noDeviceHeaders?: boolean;
}

let passed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (!condition) {
    console.error(`  ✗ ${name}`);
    if (detail !== undefined) console.error('    ', JSON.stringify(detail, null, 2).slice(0, 1500));
    process.exit(1);
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function call(method: string, path: string, opts: Opts = {}): Promise<Res> {
  const headers: Record<string, string> = { origin: 'http://localhost:5173' };
  if (!opts.noDeviceHeaders) {
    headers.device_id = opts.device ?? 'smoke-device-1';
    headers.device_type = '3';
    headers.timezone = 'Asia/Kolkata';
    headers.lang = opts.lang ?? 'en';
  }
  Object.assign(headers, opts.headers ?? {});
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await response.text();
  let body: Res['body'] = {};
  try {
    body = JSON.parse(text) as Res['body'];
  } catch {
    // Non-JSON responses (CSV downloads, empty bodies): callers read `text` instead.
  }
  return { status: response.status, headers: response.headers, body, text };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(label: string, fn: () => Promise<T | null>, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value !== null) return value;
    await sleep(300);
  }
  check(`${label} (timed out)`, false);
  throw new Error('unreachable');
}

interface Account {
  id: string;
  email: string;
  access: string;
  refresh: string;
}

async function register(name: string, device = 'smoke-device-1'): Promise<Account> {
  const email = `${name.toLowerCase()}.${RUN}@example.com`;
  const res = await call('POST', '/auth/register', { body: { name, email, password: 'Secret@123' }, device });
  check(`register ${name} -> 201`, res.status === 201, res.body);
  return {
    id: res.body.data.user.id,
    email,
    access: res.headers.get('x-access-token') ?? '',
    refresh: res.headers.get('x-refresh-token') ?? '',
  };
}

async function main(): Promise<void> {
  console.log(`SplitEase smoke test against ${BASE_URL} (run ${RUN})\n`);

  console.log('System & headers');
  const health = await call('GET', `${BASE_URL}/health`, { noDeviceHeaders: true });
  check(
    'GET /health without device headers -> 200, all deps up',
    health.status === 200 &&
      health.body.data.mongo === 'up' &&
      health.body.data.redis === 'up' &&
      health.body.data.rabbitmq === 'up',
    health.body,
  );
  const noDevice = await call('GET', '/users/me', { noDeviceHeaders: true });
  check(
    'missing device_id -> 400 DEVICE_ID_REQUIRED with requestId',
    noDevice.status === 400 && noDevice.body.code === 'DEVICE_ID_REQUIRED' && !!noDevice.body.requestId,
    noDevice.body,
  );
  const badType = await call('GET', '/users/me', { headers: { device_type: '7' } });
  check(
    'device_type 7 -> 400 INVALID_DEVICE_TYPE',
    badType.body.code === 'INVALID_DEVICE_TYPE',
    badType.body,
  );
  const badTz = await call('GET', '/users/me', { headers: { timezone: 'Mars/Base' } });
  check('bad timezone -> 400 INVALID_TIMEZONE', badTz.body.code === 'INVALID_TIMEZONE', badTz.body);
  const noAuth = await call('GET', '/users/me');
  check(
    'no token -> 401 UNAUTHORIZED',
    noAuth.status === 401 && noAuth.body.code === 'UNAUTHORIZED',
    noAuth.body,
  );
  const unknownRoute = await call('GET', '/nope');
  check(
    'unknown route -> 404 NOT_FOUND envelope',
    unknownRoute.status === 404 && unknownRoute.body.code === 'NOT_FOUND',
  );
  const badJson = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      device_id: 'd1',
      device_type: '3',
      timezone: 'UTC',
      lang: 'en',
    },
    body: '{"email":',
  });
  check('malformed JSON -> 400 VALIDATION_ERROR', badJson.status === 400);

  console.log('\nAuth');
  const aman = await register('Aman');
  check(
    'tokens only in headers, not in body',
    aman.access.length > 20 &&
      aman.refresh.length > 20 &&
      !JSON.stringify((await call('GET', '/users/me', { token: aman.access })).body).includes(aman.access),
  );
  const rahul = await register('Rahul');
  const neha = await register('Neha');
  const outsider = await register('Outsider');

  const loginRes = await call('POST', '/auth/login', { body: { email: aman.email, password: 'Secret@123' } });
  check('login -> 200 + token headers', loginRes.status === 200 && !!loginRes.headers.get('x-access-token'));
  check(
    'CORS exposes x-access-token, x-refresh-token',
    (loginRes.headers.get('access-control-expose-headers') ?? '').includes('x-access-token') &&
      (loginRes.headers.get('access-control-expose-headers') ?? '').includes('x-refresh-token'),
  );
  const oldDeviceToken = aman.access;
  aman.access = loginRes.headers.get('x-access-token') ?? '';
  aman.refresh = loginRes.headers.get('x-refresh-token') ?? '';
  const replaced = await call('GET', '/users/me', { token: oldDeviceToken });
  check(
    're-login on same device replaces old session (old token -> 401)',
    replaced.status === 401,
    replaced.body,
  );

  const dup = await call('POST', '/auth/register', {
    body: { name: 'Aman', email: aman.email.toUpperCase(), password: 'Secret@123' },
  });
  check(
    'duplicate email (case-insensitive) -> 409 EMAIL_TAKEN',
    dup.status === 409 && dup.body.code === 'EMAIL_TAKEN',
    dup.body,
  );
  const weak = await call('POST', '/auth/register', {
    body: { name: 'W', email: `weak.${RUN}@example.com`, password: 'short' },
  });
  check(
    'weak password -> 400 VALIDATION_ERROR with details',
    weak.status === 400 && Array.isArray(weak.body.details),
  );
  const wrong = await call('POST', '/auth/login', { body: { email: aman.email, password: 'Wrong@123' } });
  check('wrong password -> 401', wrong.status === 401);

  const limitedEmail = `ratelimit.${RUN}@example.com`;
  const attempts: number[] = [];
  for (let i = 0; i < 6; i += 1) {
    attempts.push(
      (await call('POST', '/auth/login', { body: { email: limitedEmail, password: 'Wrong@123' } })).status,
    );
  }
  const limited = await call('POST', '/auth/login', { body: { email: limitedEmail, password: 'Wrong@123' } });
  check(
    '6th login try within a minute -> 429 TOO_MANY_ATTEMPTS + Retry-After',
    attempts.slice(0, 5).every((s) => s === 401) &&
      attempts[5] === 429 &&
      limited.body.code === 'TOO_MANY_ATTEMPTS' &&
      !!limited.headers.get('retry-after'),
    { attempts, body: limited.body },
  );

  const phone = await call('POST', '/auth/login', {
    body: { email: rahul.email, password: 'Secret@123' },
    device: 'rahul-phone',
  });
  const phoneRefresh1 = phone.headers.get('x-refresh-token') ?? '';
  const rotated = await call('POST', '/auth/refresh', {
    device: 'rahul-phone',
    headers: { 'x-refresh-token': phoneRefresh1 },
  });
  const phoneRefresh2 = rotated.headers.get('x-refresh-token') ?? '';
  const phoneAccess2 = rotated.headers.get('x-access-token') ?? '';
  check(
    'refresh -> 200 with a new pair',
    rotated.status === 200 && phoneRefresh2 !== phoneRefresh1 && !!phoneAccess2,
    rotated.body,
  );
  const wrongDevice = await call('POST', '/auth/refresh', {
    device: 'other-device',
    headers: { 'x-refresh-token': phoneRefresh2 },
  });
  check('refresh token from another device -> 401', wrongDevice.status === 401);
  const reused = await call('POST', '/auth/refresh', {
    device: 'rahul-phone',
    headers: { 'x-refresh-token': phoneRefresh1 },
  });
  check(
    'reusing a rotated refresh token -> 401 REFRESH_TOKEN_REUSED',
    reused.status === 401 && reused.body.code === 'REFRESH_TOKEN_REUSED',
    reused.body,
  );
  const afterReuse = await call('POST', '/auth/refresh', {
    device: 'rahul-phone',
    headers: { 'x-refresh-token': phoneRefresh2 },
  });
  const accessAfterReuse = await call('GET', '/users/me', { device: 'rahul-phone', token: phoneAccess2 });
  check(
    'after reuse the whole session is dead (refresh + access -> 401)',
    afterReuse.status === 401 && accessAfterReuse.status === 401,
  );
  const noRefresh = await call('POST', '/auth/refresh');
  check('refresh without x-refresh-token -> 401', noRefresh.status === 401);

  const tablet = await call('POST', '/auth/login', {
    body: { email: neha.email, password: 'Secret@123' },
    device: 'neha-tablet',
  });
  const tabletToken = tablet.headers.get('x-access-token') ?? '';
  const sessions = await call('GET', '/auth/sessions', { token: neha.access });
  check(
    'GET /auth/sessions lists both devices, current flagged',
    sessions.body.data.sessions.length === 2 &&
      sessions.body.data.sessions.filter((s: { current: boolean }) => s.current).length === 1,
    sessions.body,
  );
  const crossDevice = await call('GET', '/users/me', { token: tabletToken });
  check('access token used from another device_id -> 401', crossDevice.status === 401);
  const logout = await call('POST', '/auth/logout', { token: tabletToken, device: 'neha-tablet' });
  const afterLogout = await call('GET', '/users/me', { token: tabletToken, device: 'neha-tablet' });
  check(
    'logout -> token rejected immediately (session gone from Redis)',
    logout.status === 200 && afterLogout.status === 401,
  );
  const tmpLogin = await call('POST', '/auth/login', {
    body: { email: outsider.email, password: 'Secret@123' },
    device: 'outsider-2',
  });
  const logoutAll = await call('POST', '/auth/logout-all', { token: outsider.access });
  const tmpAfter = await call('GET', '/users/me', {
    token: tmpLogin.headers.get('x-access-token') ?? '',
    device: 'outsider-2',
  });
  check(
    'logout-all ends every session',
    logoutAll.body.data.sessionsEnded === 2 && tmpAfter.status === 401,
    logoutAll.body,
  );
  const outsiderLogin = await call('POST', '/auth/login', {
    body: { email: outsider.email, password: 'Secret@123' },
  });
  outsider.access = outsiderLogin.headers.get('x-access-token') ?? '';

  console.log('\nUsers');
  const me = await call('GET', '/users/me', { token: aman.access });
  check('GET /users/me', me.status === 200 && me.body.data.user.email === aman.email);
  const renamed = await call('PATCH', '/users/me', { token: aman.access, body: { name: '  Aman  ' } });
  check('PATCH /users/me trims the name', renamed.body.data.user.name === 'Aman');
  const found = await call('GET', `/users/search?email=${encodeURIComponent(rahul.email.toUpperCase())}`, {
    token: aman.access,
  });
  check(
    'GET /users/search exact email (case-insensitive)',
    found.status === 200 && found.body.data.user.id === rahul.id,
  );
  const notFound = await call('GET', `/users/search?email=nobody.${RUN}@example.com`, { token: aman.access });
  check('search unknown email -> 404', notFound.status === 404);

  console.log('\nGroups');
  const created = await call('POST', '/groups', { token: aman.access, body: { name: 'Goa Trip' } });
  const groupId: string = created.body.data.group.id;
  check(
    'POST /groups -> 201, creator is a member',
    created.status === 201 && created.body.data.group.members[0].userId === aman.id,
  );
  for (const user of [rahul, neha]) {
    const added = await call('POST', `/groups/${groupId}/members`, {
      token: aman.access,
      body: { email: user.email },
    });
    check(`add ${user.email.split('.')[0]} by email -> 201`, added.status === 201);
  }
  const again = await call('POST', `/groups/${groupId}/members`, {
    token: aman.access,
    body: { email: rahul.email },
  });
  check(
    'adding an existing member -> 409 ALREADY_MEMBER',
    again.status === 409 && again.body.code === 'ALREADY_MEMBER',
  );
  const ghost = await call('POST', `/groups/${groupId}/members`, {
    token: aman.access,
    body: { email: `ghost.${RUN}@example.com` },
  });
  check('adding an unknown email -> 404', ghost.status === 404);
  const forbidden = await call('GET', `/groups/${groupId}`, { token: outsider.access });
  check(
    'non-member -> 403 NOT_GROUP_MEMBER',
    forbidden.status === 403 && forbidden.body.code === 'NOT_GROUP_MEMBER',
  );
  const badId = await call('GET', '/groups/not-an-id', { token: aman.access });
  check(
    'malformed groupId -> 400 VALIDATION_ERROR',
    badId.status === 400 && badId.body.code === 'VALIDATION_ERROR',
  );
  const missing = await call('GET', '/groups/66f1c0ffee00000000000000', { token: aman.access });
  check('unknown groupId -> 404', missing.status === 404);
  const details = await call('GET', `/groups/${groupId}`, { token: rahul.access });
  check('GET /groups/:groupId with 3 members', details.body.data.group.memberCount === 3);
  const renamedGroup = await call('PATCH', `/groups/${groupId}`, {
    token: neha.access,
    body: { name: 'Goa Trip 2026' },
  });
  check('PATCH /groups/:groupId renames', renamedGroup.body.data.group.name === 'Goa Trip 2026');

  console.log('\nExpenses');
  const base = `/groups/${groupId}/expenses`;
  const dinner = await call('POST', base, {
    token: aman.access,
    body: {
      description: 'Dinner',
      amount: 1000,
      paidBy: aman.id,
      splitType: 'EQUAL',
      participants: [aman.id, rahul.id, neha.id],
      expenseDate: '2026-10-28',
    },
  });
  check(
    'EQUAL 1000 / 3 -> 334, 333, 333 (leftover to first)',
    dinner.status === 201 &&
      JSON.stringify(dinner.body.data.expense.splits.map((s: { share: number }) => s.share)) ===
        '[334,333,333]',
    dinner.body,
  );
  check(
    'date-only expenseDate interpreted in Asia/Kolkata',
    dinner.body.data.expense.expenseDate === '2026-10-27T18:30:00.000Z',
  );
  const hotel = await call('POST', base, {
    token: rahul.access,
    body: {
      description: 'Hotel',
      amount: 900000,
      paidBy: rahul.id,
      splitType: 'EXACT',
      splits: [
        { userId: aman.id, share: 400000 },
        { userId: rahul.id, share: 300000 },
        { userId: neha.id, share: 200000 },
      ],
    },
  });
  check('EXACT split -> 201', hotel.status === 201);
  const cab = await call('POST', base, {
    token: neha.access,
    body: {
      description: 'Cab',
      amount: 50000,
      paidBy: neha.id,
      splitType: 'PERCENT',
      splits: [
        { userId: aman.id, percent: 50 },
        { userId: neha.id, percent: 50 },
      ],
    },
  });
  check(
    'PERCENT split stored in paise (25000 / 25000)',
    cab.status === 201 && cab.body.data.expense.splits.every((s: { share: number }) => s.share === 25000),
  );
  const mismatch = await call('POST', base, {
    token: aman.access,
    body: {
      description: 'x',
      amount: 1000,
      paidBy: aman.id,
      splitType: 'EXACT',
      splits: [
        { userId: aman.id, share: 600 },
        { userId: rahul.id, share: 300 },
      ],
    },
  });
  check(
    'EXACT not summing -> 400 SPLIT_TOTAL_MISMATCH',
    mismatch.status === 400 && mismatch.body.code === 'SPLIT_TOTAL_MISMATCH',
    mismatch.body,
  );
  const pctMismatch = await call('POST', base, {
    token: aman.access,
    body: {
      description: 'x',
      amount: 1000,
      paidBy: aman.id,
      splitType: 'PERCENT',
      splits: [
        { userId: aman.id, percent: 60 },
        { userId: rahul.id, percent: 30 },
      ],
    },
  });
  check(
    'PERCENT not summing to 100 -> 400 SPLIT_TOTAL_MISMATCH',
    pctMismatch.body.code === 'SPLIT_TOTAL_MISMATCH',
  );
  const outsiderSplit = await call('POST', base, {
    token: aman.access,
    body: {
      description: 'x',
      amount: 1000,
      paidBy: aman.id,
      splitType: 'EQUAL',
      participants: [aman.id, outsider.id],
    },
  });
  check(
    'split with a non-member -> 400 VALIDATION_ERROR',
    outsiderSplit.status === 400 && outsiderSplit.body.code === 'VALIDATION_ERROR',
  );
  const outsiderPayer = await call('POST', base, {
    token: aman.access,
    body: { description: 'x', amount: 1000, paidBy: outsider.id, splitType: 'EQUAL' },
  });
  check('paidBy non-member -> 400', outsiderPayer.status === 400);
  const floatAmount = await call('POST', base, {
    token: aman.access,
    body: { description: 'x', amount: 12.5, paidBy: aman.id, splitType: 'EQUAL' },
  });
  check(
    'float amount -> 400 VALIDATION_ERROR',
    floatAmount.status === 400 && floatAmount.body.code === 'VALIDATION_ERROR',
  );
  const snacks = await call('POST', base, {
    token: neha.access,
    body: { description: 'Snacks', amount: 30000, paidBy: neha.id, splitType: 'EQUAL' },
  });
  check('EQUAL without participants -> all members', snacks.body.data.expense.splits.length === 3);

  const page1 = await call('GET', `${base}?page=1&limit=2&sortBy=amount&order=desc`, { token: aman.access });
  check(
    'list: pagination + sort (page 1 of 2, biggest first)',
    page1.body.data.total === 4 &&
      page1.body.data.totalPages === 2 &&
      page1.body.data.items.length === 2 &&
      page1.body.data.items[0].description === 'Hotel',
    page1.body.data,
  );
  const searched = await call('GET', `${base}?search=hotel`, { token: aman.access });
  check(
    'list: text search',
    searched.body.data.total === 1 && searched.body.data.items[0].description === 'Hotel',
  );
  const byPayer = await call('GET', `${base}?paidBy=${neha.id}`, { token: aman.access });
  check('list: paidBy filter', byPayer.body.data.total === 2);
  const byDate = await call('GET', `${base}?from=2026-10-28&to=2026-10-28`, { token: aman.access });
  check(
    'list: from/to (inclusive, in caller timezone)',
    byDate.body.data.total === 1 && byDate.body.data.items[0].description === 'Dinner',
    byDate.body.data,
  );
  const badRange = await call('GET', `${base}?from=2026-10-30&to=2026-10-01`, { token: aman.access });
  check('list: from after to -> 400', badRange.status === 400);
  const badLimit = await call('GET', `${base}?limit=500`, { token: aman.access });
  check('list: limit > 100 -> 400', badLimit.status === 400);

  const dinnerId: string = dinner.body.data.expense.id;
  const one = await call('GET', `${base}/${dinnerId}`, { token: neha.access });
  check('GET one expense with names', one.body.data.expense.paidBy.name === 'Aman');
  const reamount = await call('PATCH', `${base}/${dinnerId}`, {
    token: aman.access,
    body: { amount: 120000 },
  });
  check(
    'PATCH amount on EQUAL re-splits (40000 each)',
    reamount.status === 200 &&
      reamount.body.data.expense.splits.every((s: { share: number }) => s.share === 40000),
    reamount.body,
  );
  const hotelId: string = hotel.body.data.expense.id;
  const exactAmount = await call('PATCH', `${base}/${hotelId}`, {
    token: rahul.access,
    body: { amount: 950000 },
  });
  check(
    'PATCH amount on EXACT without splits -> SPLIT_TOTAL_MISMATCH',
    exactAmount.body.code === 'SPLIT_TOTAL_MISMATCH',
  );
  const emptyPatch = await call('PATCH', `${base}/${hotelId}`, { token: rahul.access, body: {} });
  check('empty PATCH -> 400', emptyPatch.status === 400);
  const snacksId: string = snacks.body.data.expense.id;
  const del = await call('DELETE', `${base}/${snacksId}`, { token: neha.access });
  const delAgain = await call('DELETE', `${base}/${snacksId}`, { token: neha.access });
  const getDeleted = await call('GET', `${base}/${snacksId}`, { token: neha.access });
  check(
    'soft delete -> 200, then 404 for delete/get',
    del.status === 200 && delAgain.status === 404 && getDeleted.status === 404,
  );

  console.log('\nBalances');
  // Expected: aman +120000-40000-400000-25000 = -345000; rahul +900000-40000-300000 = 560000; neha +50000-40000-200000-25000 = -215000
  const balances = await waitFor('balances become fresh', async () => {
    const res = await call('GET', `/groups/${groupId}/balances`, { token: aman.access });
    return res.body.data.stale === false ? res : null;
  });
  const net = Object.fromEntries(
    balances.body.data.balances.map((b: { userId: string; net: number }) => [b.userId, b.net]),
  );
  check(
    'group balances computed (aggregation) and cached',
    net[aman.id] === -345000 && net[rahul.id] === 560000 && net[neha.id] === -215000,
    balances.body.data,
  );
  check('balances sum to 0', Object.values(net).reduce((a: number, b) => a + (b as number), 0) === 0);
  const plan = await call('GET', `/groups/${groupId}/settle-plan`, { token: aman.access });
  check(
    'settle-plan: 2 payments to Rahul (worker thread)',
    plan.body.data.payments.length === 2 &&
      plan.body.data.payments.every((p: { to: string }) => p.to === rahul.id),
    plan.body.data,
  );
  const groupsList = await call('GET', '/groups', { token: aman.access });
  check(
    'GET /groups shows my balance in each group',
    groupsList.body.data.items[0].myBalance === -345000,
    groupsList.body.data,
  );
  const myBalances = await call('GET', '/balances/me', { token: aman.access });
  check(
    'GET /balances/me totals',
    myBalances.body.data.youOwe === 345000 && myBalances.body.data.summary.youOwe === '₹3,450.00',
    myBalances.body.data,
  );
  const removeOwing = await call('DELETE', `/groups/${groupId}/members/${neha.id}`, { token: aman.access });
  check(
    'removing a member with non-zero balance -> 409 BALANCE_NOT_SETTLED',
    removeOwing.status === 409 && removeOwing.body.code === 'BALANCE_NOT_SETTLED',
  );

  console.log('\nSettlements');
  const selfSettle = await call('POST', `/groups/${groupId}/settlements`, {
    token: aman.access,
    body: { toUserId: aman.id, amount: 100 },
  });
  check('settling with yourself -> 400', selfSettle.status === 400);
  for (const payment of plan.body.data.payments as { from: string; to: string; amount: number }[]) {
    const token = payment.from === aman.id ? aman.access : neha.access;
    const res = await call('POST', `/groups/${groupId}/settlements`, {
      token,
      body: { toUserId: payment.to, amount: payment.amount, note: 'UPI' },
    });
    check(`record settlement ${payment.amount} -> 201`, res.status === 201, res.body);
  }
  const settled = await waitFor('balances settle to zero', async () => {
    const res = await call('GET', `/groups/${groupId}/balances`, { token: rahul.access });
    return res.body.data.stale === false && res.body.data.isSettled ? res : null;
  });
  check(
    'after following the plan everyone is at 0',
    settled.body.data.balances.every((b: { net: number }) => b.net === 0),
  );
  const settlementList = await call('GET', `/groups/${groupId}/settlements?limit=1`, { token: rahul.access });
  check(
    'GET settlements paginated',
    settlementList.body.data.total === 2 && settlementList.body.data.items.length === 1,
  );
  const emptyPlan = await call('GET', `/groups/${groupId}/settle-plan`, { token: aman.access });
  check('settle-plan empty once settled', emptyPlan.body.data.payments.length === 0);

  console.log('\nActivity & email');
  const feed = await waitFor('activity feed populated', async () => {
    const res = await call('GET', '/activity?limit=50', { token: rahul.access });
    return res.body.data.total >= 9 ? res : null;
  });
  const types = new Set(feed.body.data.items.map((a: { type: string }) => a.type));
  check(
    'activity has every type, newest first',
    ['EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED', 'SETTLEMENT_ADDED', 'MEMBER_ADDED'].every((t) =>
      types.has(t),
    ) && new Date(feed.body.data.items[0].createdAt) >= new Date(feed.body.data.items.at(-1).createdAt),
    [...types],
  );
  try {
    const mails = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${rahul.email}`)}`)
    ).json()) as { messages_count: number };
    check('emails delivered to Mailpit', mails.messages_count > 0, mails);
  } catch {
    console.log('  - Mailpit not reachable from here, skipped email check');
  }

  console.log('\nMembers');
  const removeSettled = await call('DELETE', `/groups/${groupId}/members/${neha.id}`, { token: aman.access });
  check(
    'removing a settled member -> 200',
    removeSettled.status === 200 && removeSettled.body.data.group.memberCount === 2,
  );
  const nehaNoAccess = await call('GET', `/groups/${groupId}`, { token: neha.access });
  check('removed member loses access -> 403', nehaNoAccess.status === 403);

  console.log('\nExports');
  const requested = await call('POST', `/groups/${groupId}/exports`, { token: aman.access });
  const exportId: string = requested.body.data.exportId;
  check(
    'POST exports -> 202 QUEUED',
    requested.status === 202 && ['QUEUED', 'PROCESSING', 'DONE'].includes(requested.body.data.status),
  );
  const early = await call('GET', `/exports/${exportId}/download`, { token: aman.access });
  check('download before DONE -> 404 (or ready already)', early.status === 404 || early.status === 200);
  const outsiderExport = await call('GET', `/exports/${exportId}`, { token: outsider.access });
  check('outsider cannot see the export -> 403', outsiderExport.status === 403);
  const done = await waitFor('export finishes', async () => {
    const res = await call('GET', `/exports/${exportId}`, { token: aman.access });
    return res.body.data.status === 'DONE' ? res : null;
  });
  check(
    'export DONE, progress 100',
    done.body.data.progress === 100 && done.body.data.rowCount === 5,
    done.body.data,
  );
  const csv = await call('GET', `/exports/${exportId}/download`, { token: rahul.access });
  const lines = csv.text
    .replace(/^\uFEFF/, '')
    .trim()
    .split('\r\n');
  check(
    'download CSV: text/csv, header + member columns',
    csv.status === 200 &&
      (csv.headers.get('content-type') ?? '').startsWith('text/csv') &&
      lines[0] === 'date,description,paidBy,amount,splitType,Aman,Rahul,Neha',
    lines,
  );
  check(
    'CSV rows: 3 expenses + 2 settlements (deleted excluded)',
    lines.length === 6 && !csv.text.includes('Snacks'),
    lines,
  );

  console.log(`\nAll ${passed} checks passed.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
