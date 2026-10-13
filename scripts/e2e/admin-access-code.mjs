/**
 * Live walk-through of the Super Admin Dashboard -> Admin access code workflow,
 * against a real server and database. Checks the acceptance criteria end to
 * end: cookies, sessions and redirects are exactly what the in-memory suite
 * cannot see.
 *
 * It creates two throwaway Admins and removes them on the way out, success or
 * failure.
 *
 *   npm run test:admins
 *
 * Needs:
 *   TDMS_BASE              default http://localhost:3000
 *   SUPER_ADMIN_EMAIL      an existing Super Admin
 *   SUPER_ADMIN_PASSWORD   their password
 *
 * No security code: nothing in this workflow asks for one.
 */
import { fetchPage, isPagePath } from './lib/pages.mjs';

const BASE = process.env.TDMS_BASE ?? 'http://localhost:3000';
const OWNER_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const OWNER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!OWNER_EMAIL || !OWNER_PASSWORD) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.');
  process.exit(2);
}

/** One cookie jar per notional browser, so sessions cannot borrow each other's. */
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
        if (value === '' || /Expires=Thu, 01 Jan 1970/i.test(raw)) store.delete(name);
        else store.set(name, value);
      }
    },
    has: (name) => store.has(name),
  };
}

async function call(cookies, method, path, body) {
  if (method === 'GET' && isPagePath(path)) {
    const page = await fetchPage(BASE, path, cookies.header() ? { cookie: cookies.header() } : {});
    let payload = null;
    try { payload = JSON.parse(page.text.split(String.fromCharCode(10))[0]); } catch {}
    return { status: page.status, payload, text: page.text, location: page.location };
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
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
  return { status: response.status, payload, text, location: response.headers.get('location') };
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

const redirectsTo = (r, path) =>
  (r.status === 307 || r.status === 302) && (r.location ?? '').includes(path);

const stamp = Date.now();
const JAMES = { name: 'E2E James', email: `e2e-james-${stamp}@example.test`, password: `E2e#James${stamp}xY` };
const MARIA = { name: 'E2E Maria', email: `e2e-maria-${stamp}@example.test`, password: `E2e#Maria${stamp}xY` };
const NEW_PASSWORD = `E2e#Perm${stamp}xY`;

const created = [];

async function signIn(email, password) {
  const browser = jar();
  const r = await call(browser, 'POST', '/api/v1/auth/login', { identifier: email, password, remember: false });
  return { browser, r };
}

try {
  // 1-3 --------------------------------------------------------------------
  console.log('\n1-3. Super Admin, dashboard, Admin Access Codes');
  const { browser: owner, r: ownerLogin } = await signIn(OWNER_EMAIL, OWNER_PASSWORD);
  check('Super Admin signs in', ownerLogin.status === 200 && owner.has('tdms_session'), ownerLogin.payload?.message);
  if (!owner.has('tdms_session')) throw new Error('no Super Admin session; cannot continue');

  const dashboard = await call(owner, 'GET', '/dashboard');
  check('dashboard renders', dashboard.status === 200, `status ${dashboard.status}`);
  check('dashboard shows Admin Access Codes', dashboard.text.includes('Admin Access Codes'));
  check('dashboard shows the security code status, not a value', dashboard.text.includes('Super Admin security code'));

  const codesPage = await call(owner, 'GET', '/admin-access-codes');
  check('Access Codes page renders', codesPage.status === 200, `status ${codesPage.status}`);

  const staffScreen = await call(owner, 'GET', '/api/v1/staff');
  check('Super Admin cannot manage staff', staffScreen.status === 403, `status ${staffScreen.status}`);

  // Accounts ----------------------------------------------------------------
  for (const who of [JAMES, MARIA]) {
    const c = await call(owner, 'POST', '/api/v1/admins', {
      name: who.name,
      email: who.email,
      temporaryPassword: who.password,
      temporaryPasswordConfirmation: who.password,
    });
    check(`creates ${who.name} without a security code`, c.status === 201, c.payload?.message);
    if (c.status !== 201) throw new Error('no admin created; cannot continue');
    who.id = c.payload.data.id;
    created.push(who.id);
    check(`${who.name}: creation issues no code`, !('accessCode' in c.payload.data));
  }
  const fresh = await call(owner, 'GET', '/api/v1/admins');
  const jamesRow = fresh.payload?.data?.rows?.find((r) => r.email === JAMES.email);
  check('a new Admin is PENDING_INITIAL_SETUP', jamesRow?.setupState === 'PENDING_INITIAL_SETUP', jamesRow?.setupState);

  // Temporary password reveal ---------------------------------------------
  console.log('\nTemporary password: shown again on request, never stored in plaintext');
  const creds = await call(owner, 'GET', `/api/v1/admins/${JAMES.id}/credentials`);
  check('credentials say a temporary password is available', creds.payload?.data?.temporaryPassword?.state === 'available',
    JSON.stringify(creds.payload?.data?.temporaryPassword));
  check('the credentials view does not contain the password', !creds.text.includes(JAMES.password));
  const shown = await call(owner, 'POST', `/api/v1/admins/${JAMES.id}/temporary-password/reveal`);
  check('Show reveals the same temporary password', shown.payload?.data?.temporaryPassword === JAMES.password, shown.payload?.message);
  const revealResponse = await fetch(`${BASE}/api/v1/admins/${JAMES.id}/temporary-password/reveal`, {
    method: 'POST',
    headers: { cookie: owner.header() },
  });
  check('the reveal response is no-store', /no-store/.test(revealResponse.headers.get('cache-control') ?? ''));
  const anon = await call(jar(), 'POST', `/api/v1/admins/${JAMES.id}/temporary-password/reveal`);
  check('an anonymous caller cannot reveal', anon.status === 401, `status ${anon.status}`);
  {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const rows = await prisma.temporaryCredential.findMany({ where: { userId: BigInt(JAMES.id) } });
    const user = await prisma.user.findUnique({ where: { id: BigInt(JAMES.id) }, select: { password: true } });
    await prisma.$disconnect();
    const everything = JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) + user.password;
    check('the database holds no plaintext copy of it', !everything.includes(JAMES.password));
  }

  // 4-5 --------------------------------------------------------------------
  console.log('\n4-5. Generating a code for James');
  const gen = await call(owner, 'POST', '/api/v1/admin-access-codes', { adminId: JAMES.id, expiresInMinutes: 10 });
  check('generates a code', gen.status === 201, gen.payload?.message);
  const code = gen.payload?.data?.accessCode;
  const codeId = gen.payload?.data?.codeId;
  check('it is six digits', /^[0-9]{6}$/.test(code ?? ''));
  check('it is bound to James', gen.payload?.data?.email === JAMES.email);
  check('it expires in 10 minutes', gen.payload?.data?.expiresInMinutes === 10);

  const list = await call(owner, 'GET', '/api/v1/admin-access-codes');
  const listed = list.payload?.data?.rows?.find((r) => r.id === codeId);
  check('listed as ACTIVE for James', listed?.status === 'ACTIVE' && listed?.adminEmail === JAMES.email);
  check('the list never contains the code', !list.text.includes(code));
  const view = await call(owner, 'GET', `/api/v1/admin-access-codes/${codeId}`);
  check('View never contains the code', view.status === 200 && !view.text.includes(code));

  // 15 ---------------------------------------------------------------------
  console.log("\n15. James's code cannot sign in Maria");
  const { browser: maria, r: mariaStep1 } = await signIn(MARIA.email, MARIA.password);
  check('Maria reaches the code step', mariaStep1.payload?.data?.stage === 'access_code');
  const cross = await call(maria, 'POST', '/api/v1/auth/admin-access-code', { code });
  check("James's code is refused for Maria", cross.status === 422, `status ${cross.status}`);
  check('Maria has no session', !maria.has('tdms_session'));

  // 6-11 -------------------------------------------------------------------
  console.log('\n6-11. James signs in');
  const { browser: james, r: step1 } = await signIn(JAMES.email, JAMES.password);
  check('password accepted', step1.status === 200, step1.payload?.message);
  check('asked for the access code', step1.payload?.data?.stage === 'access_code');
  check('NO session yet', !james.has('tdms_session'));
  check('dashboard unreachable yet', redirectsTo(await call(james, 'GET', '/dashboard'), '/login'));

  const state = await call(james, 'GET', '/api/v1/auth/admin-access-code');
  check('code screen has a countdown', (state.payload?.data?.challenge?.codeExpiresInSeconds ?? 0) > 0);

  const ok = await call(james, 'POST', '/api/v1/auth/admin-access-code', { code });
  check('code verified', ok.status === 200, ok.payload?.message);
  check('session issued now', james.has('tdms_session'));
  check('sent to change the temporary password', ok.payload?.data?.redirectTo === '/change-password');

  const afterUse = await call(owner, 'GET', `/api/v1/admin-access-codes/${codeId}`);
  check('code is now USED', afterUse.payload?.data?.status === 'USED', afterUse.payload?.data?.status);

  check('temporary password blocks the API', (await call(james, 'GET', '/api/v1/staff')).payload?.code === 'PASSWORD_CHANGE_REQUIRED');
  const changed = await call(james, 'POST', '/api/v1/auth/change-password', {
    currentPassword: JAMES.password,
    password: NEW_PASSWORD,
    passwordConfirmation: NEW_PASSWORD,
  });
  check('temporary password replaced', changed.status === 200, changed.payload?.message);
  const adminDash = await call(james, 'GET', '/dashboard');
  check('James reaches the dashboard', adminDash.status === 200, `status ${adminDash.status}`);
  check('James (Admin) can manage staff', (await call(james, 'GET', '/api/v1/staff')).status === 200);
  const peek = await call(james, 'POST', `/api/v1/admins/${MARIA.id}/temporary-password/reveal`);
  check("an Admin cannot reveal another Admin's password", peek.status === 403, `status ${peek.status}`);
  const afterChange = await call(owner, 'GET', `/api/v1/admins/${JAMES.id}/credentials`);
  check('after he changes it: "No active temporary password"', afterChange.payload?.data?.temporaryPassword?.state === 'none',
    afterChange.payload?.data?.temporaryPassword?.state);
  const tooLate = await call(owner, 'POST', `/api/v1/admins/${JAMES.id}/temporary-password/reveal`);
  check('and it can no longer be revealed', tooLate.status === 409, `status ${tooLate.status}`);

  // 12 ---------------------------------------------------------------------
  console.log('\n12. After setup: email + password only, never an access code again');
  const afterSetup = await call(owner, 'GET', '/api/v1/admins');
  const doneRow = afterSetup.payload?.data?.rows?.find((r) => r.email === JAMES.email);
  check('account is now ACTIVE (setup complete)', doneRow?.setupState === 'ACTIVE', doneRow?.setupState);
  check('the access code is USED', (await call(owner, 'GET', `/api/v1/admin-access-codes/${codeId}`)).payload?.data?.status === 'USED');

  const logout = await call(james, 'POST', '/api/v1/auth/logout');
  check('logs out', logout.status === 200 && !james.has('tdms_session'), `status ${logout.status}`);

  for (const when of ['next sign-in', 'another sign-in later']) {
    const { browser: back, r: backIn } = await signIn(JAMES.email, NEW_PASSWORD);
    check(`${when}: stage is complete, no access code step`, backIn.payload?.data?.stage === 'complete', backIn.payload?.data?.stage);
    check(`${when}: signed in straight away`, back.has('tdms_session'));
    check(`${when}: no half-finished sign-in cookie`, !back.has('tdms_admin_login'));
    check(`${when}: goes to the dashboard`, backIn.payload?.data?.redirectTo === '/dashboard', backIn.payload?.data?.redirectTo);
    check(`${when}: dashboard loads`, (await call(back, 'GET', '/dashboard')).status === 200);
    const screen = await call(back, 'GET', '/login/access-code');
    check(`${when}: the access-code page does not show (redirects away)`, screen.status === 307 || screen.status === 302, `status ${screen.status}`);
  }

  const replay = await call(jar(), 'POST', '/api/v1/auth/admin-access-code', { code });
  check('the used code cannot be replayed without a sign-in', replay.status === 410, `status ${replay.status}`);
  const noCode = await call(owner, 'POST', '/api/v1/admin-access-codes', { adminId: JAMES.id });
  check('no new code can be issued to an Admin who finished setup', noCode.payload?.code === 'ADMIN_SETUP_COMPLETE', noCode.payload?.code);

  // 14 ---------------------------------------------------------------------
  // Maria is still in initial setup, so the code checks below use her.
  console.log('\n14. Revoked codes fail (Admin in setup)');
  const gen2 = await call(owner, 'POST', '/api/v1/admin-access-codes', { adminId: MARIA.id });
  const revoked = await call(owner, 'POST', `/api/v1/admin-access-codes/${gen2.payload?.data?.codeId}/revoke`);
  check('revoke succeeds', revoked.status === 200 && revoked.payload?.data?.status === 'REVOKED', revoked.payload?.message);
  const { browser: afterRevoke } = await signIn(MARIA.email, MARIA.password);
  const tryRevoked = await call(afterRevoke, 'POST', '/api/v1/auth/admin-access-code', { code: gen2.payload?.data?.accessCode });
  check('revoked code refused', tryRevoked.status === 422, `status ${tryRevoked.status}`);
  check('no session from a revoked code', !afterRevoke.has('tdms_session'));

  // 13 ---------------------------------------------------------------------
  console.log('\n13. Expired codes fail (Admin in setup)');
  const gen3 = await call(owner, 'POST', '/api/v1/admin-access-codes', { adminId: MARIA.id, expiresInMinutes: 5 });
  {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    // Wind the clock forward on this one row rather than wait five minutes.
    await prisma.adminAccessCode.update({
      where: { id: BigInt(gen3.payload.data.codeId) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await prisma.$disconnect();
  }
  const { browser: afterExpiry } = await signIn(MARIA.email, MARIA.password);
  const tryExpired = await call(afterExpiry, 'POST', '/api/v1/auth/admin-access-code', { code: gen3.payload.data.accessCode });
  check('expired code refused', tryExpired.status === 422, `status ${tryExpired.status}`);
  const expiredView = await call(owner, 'GET', `/api/v1/admin-access-codes/${gen3.payload.data.codeId}`);
  check('shown as EXPIRED', expiredView.payload?.data?.status === 'EXPIRED', expiredView.payload?.data?.status);

  // 16 ---------------------------------------------------------------------
  console.log('\n16. Resetting a password asks for no security code');
  const reset = await call(owner, 'POST', `/api/v1/admins/${MARIA.id}/reset-password`);
  check('reset succeeds with no body', reset.status === 200, reset.payload?.message);
  check('returns a new temporary password', typeof reset.payload?.data?.temporaryPassword === 'string');
  const afterReset = await call(owner, 'POST', `/api/v1/admins/${MARIA.id}/temporary-password/reveal`);
  check('Show now reveals the NEW temporary password', afterReset.payload?.data?.temporaryPassword === reset.payload?.data?.temporaryPassword);
  check('and not the old one', afterReset.payload?.data?.temporaryPassword !== MARIA.password);
  const { r: oldPassword } = await signIn(MARIA.email, MARIA.password);
  check('the old temporary password no longer signs in', oldPassword.status === 401, `status ${oldPassword.status}`);

  // 17 ---------------------------------------------------------------------
  console.log('\n17. Suspended Admins cannot sign in');
  // In setup: a correct temporary password and a correct code, then suspended.
  const mariaTemp = reset.payload?.data?.temporaryPassword;
  const liveCode = await call(owner, 'POST', '/api/v1/admin-access-codes', { adminId: MARIA.id });
  const { browser: suspendedBrowser } = await signIn(MARIA.email, mariaTemp);
  await call(owner, 'POST', `/api/v1/admins/${MARIA.id}/status`, { status: 'SUSPENDED' });
  const trySuspended = await call(suspendedBrowser, 'POST', '/api/v1/auth/admin-access-code', { code: liveCode.payload?.data?.accessCode });
  check('correct code refused once suspended', trySuspended.status >= 400, `status ${trySuspended.status}`);
  check('no session for a suspended Admin', !suspendedBrowser.has('tdms_session'));
  // Setup complete: a correct permanent password, then suspended.
  await call(owner, 'POST', `/api/v1/admins/${JAMES.id}/status`, { status: 'SUSPENDED' });
  const { r: suspendedLogin } = await signIn(JAMES.email, NEW_PASSWORD);
  check('correct password refused while suspended', suspendedLogin.status === 403, `status ${suspendedLogin.status}`);

  // 18-20 ------------------------------------------------------------------
  console.log('\n18-20. No approval, no admin invitations, no exposed static code');
  const health = await call(owner, 'GET', '/api/v1/health');
  const staticValue = process.env.SUPER_ADMIN_STATIC_CODE;
  check(
    'static code value is not in /api/health',
    !staticValue || !health.text.includes(staticValue),
  );
  check(
    'static code value is not on the dashboard',
    !staticValue || !dashboard.text.includes(staticValue),
  );
  check('no "Pending approval" wording on the dashboard', !/pending approval/i.test(dashboard.text));
  const inviteAdmin = await call(owner, 'POST', '/api/v1/staff', { name: 'X', email: `x-${stamp}@example.test`, role: 'admin' });
  check('an Admin cannot be invited', inviteAdmin.status >= 400, `status ${inviteAdmin.status}`);
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.error(`\n  threw: ${error.message}`);
} finally {
  if (created.length > 0) {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
      // Cascades to codes, challenges, sessions and role rows.
      const { count } = await prisma.user.deleteMany({ where: { id: { in: created.map((id) => BigInt(id)) } } });
      console.log(`\nremoved ${count} throwaway account(s)`);
    } catch (error) {
      console.error(`\ncould not remove throwaway accounts: ${error.message}`);
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
