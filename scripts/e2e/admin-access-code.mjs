/**
 * Live walk-through of the Super Admin -> Admin -> access code workflow.
 *
 * Runs against a real server and a real database, because the properties that
 * matter most here are about cookies, sessions and redirects — things the
 * in-memory suite deliberately cannot see. It creates one throwaway
 * administrator and removes it again on the way out, success or failure.
 *
 *   node scripts/e2e/admin-access-code.mjs
 *
 * Needs, in the environment of the SERVER it talks to:
 *   SUPER_ADMIN_STATIC_CODE   the security code
 * and here:
 *   TDMS_BASE                 default http://localhost:3000
 *   SUPER_ADMIN_EMAIL         an existing Super Admin
 *   SUPER_ADMIN_PASSWORD      their password
 *   SUPER_ADMIN_STATIC_CODE   the same security code
 */

const BASE = process.env.TDMS_BASE ?? 'http://localhost:3000';
const OWNER_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const OWNER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const SECURITY_CODE = process.env.SUPER_ADMIN_STATIC_CODE;

if (!OWNER_EMAIL || !OWNER_PASSWORD || !SECURITY_CODE) {
  console.error('Set SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD and SUPER_ADMIN_STATIC_CODE.');
  process.exit(2);
}

/**
 * A cookie jar per notional browser.
 *
 * Two of these, so the Super Admin's session and the Admin's cannot borrow
 * each other's — which is most of what this script is checking.
 */
function jar() {
  const store = new Map();
  return {
    header: () => [...store].map(([k, v]) => `${k}=${v}`).join('; '),
    absorb(response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(';')[0];
        const eq = pair.indexOf('=');
        const name = pair.slice(0, eq);
        const value = pair.slice(eq + 1);
        // A deletion arrives as an empty value or an expiry in the past.
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name);
        else store.set(name, value);
      }
    },
    has: (name) => store.has(name),
  };
}

async function call(cookies, method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    // Manual, so a redirect is something to assert about rather than follow.
    redirect: 'manual',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookies.header() ? { cookie: cookies.header() } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  cookies.absorb(response);
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // An HTML page rather than the JSON envelope.
  }
  return {
    status: response.status,
    payload,
    text,
    location: response.headers.get('location'),
  };
}

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
    return;
  }
  failures.push(label);
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${detail}`}`);
}

const stamp = Date.now();
const ADMIN_EMAIL = `e2e-admin-${stamp}@example.test`;
const TEMP_PASSWORD = `E2e#Temp${stamp}xY`;
const NEW_PASSWORD = `E2e#Perm${stamp}xY`;

let createdId = null;

try {
  // --- as the Super Admin ---------------------------------------------------
  console.log('\nSuper Admin');
  const owner = jar();
  const signIn = await call(owner, 'POST', '/api/auth/login', {
    identifier: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    remember: false,
  });
  check('signs in', signIn.status === 200 && signIn.payload?.success, signIn.payload?.message);
  check('gets a session cookie', owner.has('tdms_session'));
  if (!owner.has('tdms_session')) throw new Error('no Super Admin session; cannot continue');

  const wrongCode = await call(owner, 'POST', '/api/admins', {
    name: 'E2E Admin',
    email: ADMIN_EMAIL,
    temporaryPassword: TEMP_PASSWORD,
    temporaryPasswordConfirmation: TEMP_PASSWORD,
    securityCode: 'definitely-not-the-code',
    emailAccessCode: false,
  });
  check('refuses a wrong security code', wrongCode.status === 403, `status ${wrongCode.status}`);

  const created = await call(owner, 'POST', '/api/admins', {
    name: 'E2E Admin',
    email: ADMIN_EMAIL,
    temporaryPassword: TEMP_PASSWORD,
    temporaryPasswordConfirmation: TEMP_PASSWORD,
    securityCode: SECURITY_CODE,
    emailAccessCode: false,
  });
  check('creates the admin', created.status === 201, created.payload?.message);
  if (created.status !== 201) throw new Error('no admin created; cannot continue');

  createdId = created.payload.data.id;
  const accessCode = created.payload.data.accessCode;
  check('returns a six-digit access code', /^[0-9]{6}$/.test(accessCode ?? ''));
  check(
    'returns the temporary password once',
    created.payload.data.temporaryPassword === TEMP_PASSWORD,
  );

  const listed = await call(owner, 'GET', '/api/admins');
  const row = listed.payload?.data?.rows?.find((r) => r.email === ADMIN_EMAIL);
  check('lists the new admin as ACTIVE', row?.status === 'ACTIVE', row?.status);
  check('flags it as on a temporary password', row?.mustChangePassword === true);
  check('never puts the code in the listing', !listed.text.includes(accessCode));

  // --- as the Admin ---------------------------------------------------------
  console.log('\nAdmin, step one: the password');
  const admin = jar();
  const step1 = await call(admin, 'POST', '/api/auth/login', {
    identifier: ADMIN_EMAIL,
    password: TEMP_PASSWORD,
    remember: false,
  });
  check('password is accepted', step1.status === 200 && step1.payload?.success, step1.payload?.message);
  check(
    'is sent to the access-code screen',
    step1.payload?.data?.stage === 'access_code',
    step1.payload?.data?.stage,
  );
  // The property the whole design rests on.
  check('gets NO session cookie', !admin.has('tdms_session'));
  check('gets a challenge cookie instead', admin.has('tdms_admin_login'));

  const blocked = await call(admin, 'GET', '/api/staff');
  check('cannot reach a protected API yet', blocked.status === 401, `status ${blocked.status}`);

  const dashboard = await call(admin, 'GET', '/dashboard');
  check(
    'cannot reach the dashboard yet',
    (dashboard.status === 307 || dashboard.status === 302) &&
      (dashboard.location ?? '').includes('/login'),
    `${dashboard.status} -> ${dashboard.location}`,
  );

  console.log('\nAdmin, step two: the access code');
  const state = await call(admin, 'GET', '/api/auth/admin-access-code');
  check(
    'the screen is told which address it is finishing',
    state.payload?.data?.challenge?.email === ADMIN_EMAIL,
  );
  check('and nothing about the code itself', !state.text.includes(accessCode));

  const wrong = await call(admin, 'POST', '/api/auth/admin-access-code', {
    code: accessCode === '000000' ? '111111' : '000000',
  });
  check('a wrong code is refused', wrong.status === 422, `status ${wrong.status}`);
  check('and still no session', !admin.has('tdms_session'));

  const malformed = await call(admin, 'POST', '/api/auth/admin-access-code', { code: '12345' });
  check('a malformed code is a validation error', malformed.status === 422);

  const verified = await call(admin, 'POST', '/api/auth/admin-access-code', { code: accessCode });
  check(
    'the right code is accepted',
    verified.status === 200 && verified.payload?.success,
    verified.payload?.message,
  );
  check('a session is issued now', admin.has('tdms_session'));
  check('the challenge cookie is cleared', !admin.has('tdms_admin_login'));
  check(
    'and it points at the password change',
    verified.payload?.data?.redirectTo === '/change-password',
    verified.payload?.data?.redirectTo,
  );

  console.log('\nAdmin, step three: the forced password change');
  const stillBlocked = await call(admin, 'GET', '/api/staff');
  check('a temporary password cannot use the API', stillBlocked.status === 403, `status ${stillBlocked.status}`);
  check(
    'and is told exactly why',
    stillBlocked.payload?.code === 'PASSWORD_CHANGE_REQUIRED',
    stillBlocked.payload?.code,
  );

  const divert = await call(admin, 'GET', '/dashboard');
  check(
    'the dashboard diverts to /change-password',
    (divert.status === 307 || divert.status === 302) &&
      (divert.location ?? '').includes('/change-password'),
    `${divert.status} -> ${divert.location}`,
  );

  const changed = await call(admin, 'POST', '/api/auth/change-password', {
    currentPassword: TEMP_PASSWORD,
    password: NEW_PASSWORD,
    passwordConfirmation: NEW_PASSWORD,
  });
  check('the password can be replaced', changed.status === 200, changed.payload?.message);

  const nowAllowed = await call(admin, 'GET', '/api/staff');
  check('the API opens up afterwards', nowAllowed.status !== 403, `status ${nowAllowed.status}`);

  console.log('\nThe code was single use');
  const again = jar();
  const reLogin = await call(again, 'POST', '/api/auth/login', {
    identifier: ADMIN_EMAIL,
    password: NEW_PASSWORD,
    remember: false,
  });
  check('the new password works', reLogin.payload?.data?.stage === 'access_code', reLogin.payload?.message);
  const replay = await call(again, 'POST', '/api/auth/admin-access-code', { code: accessCode });
  check('the spent code is refused', replay.status === 422, `status ${replay.status}`);
  check('and no second session came of it', !again.has('tdms_session'));
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.error(`\n  threw: ${error.message}`);
} finally {
  // --- clean up -------------------------------------------------------------
  if (createdId) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      // Cascades to its access codes, challenges, sessions and role row.
      await prisma.user.delete({ where: { id: BigInt(createdId) } });
      console.log(`\nremoved the throwaway account (${ADMIN_EMAIL})`);
    } catch (error) {
      console.error(`\ncould not remove ${ADMIN_EMAIL}: ${error.message}`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
