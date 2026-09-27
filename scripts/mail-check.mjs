/**
 * `npm run mail:check` — is email going to work in this environment?
 *
 * Two questions, answered without sending anything and without printing a
 * secret:
 *
 *   1. What has the application resolved? Read from the target's own
 *      /api/health, so this reports what the DEPLOYMENT thinks, not what a
 *      local .env says. Run it against the Vercel URL after changing
 *      environment variables — that is the whole point, since a change there
 *      does nothing until a redeploy picks it up.
 *
 *   2. Will Resend accept the sender? Asks Resend for its verified domains
 *      (a read-only API call) and compares them with EMAIL_FROM. An
 *      unverified sender domain is the most common reason a correctly
 *      configured key still sends nothing, and the error only appears at send
 *      time, one refused message at a time.
 *
 * Usage:
 *   npm run mail:check                                   # local dev server
 *   npm run mail:check -- --base https://your.vercel.app # a deployment
 *
 * RESEND_API_KEY and EMAIL_FROM are read from this shell's environment for
 * step 2. The key is never printed, logged or sent anywhere but Resend.
 */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const BASE = (arg('base') ?? process.env.BASE ?? 'http://127.0.0.1:3000').replace(/\/+$/, '');

let problems = 0;

function ok(text) {
  console.log(`  ok    ${text}`);
}
function bad(text) {
  problems += 1;
  console.log(`  FAIL  ${text}`);
}
function note(text) {
  console.log(`        ${text}`);
}

/** The domain of an address or a full "Name <addr>" header. */
function domainOf(sender) {
  const match = /<([^>]+)>/.exec(sender ?? '');
  const address = (match ? match[1] : (sender ?? '')).trim();
  const at = address.lastIndexOf('@');
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

console.log(`\n=== Application configuration (${BASE}/api/health) ===\n`);

let health = null;
try {
  const response = await fetch(`${BASE}/api/health`, { headers: { 'Cache-Control': 'no-cache' } });
  health = await response.json();
} catch (error) {
  bad(`could not reach ${BASE}/api/health — ${error instanceof Error ? error.message : error}`);
  note('Start the dev server (npm run dev), or pass --base <deployment url>.');
}

if (health) {
  const mail = health.mail ?? {};

  console.log(`  transport          ${mail.transport}`);
  console.log(`  EMAIL_PROVIDER     ${mail.provider ?? '(unset — derived)'}`);
  console.log(`  sender configured  ${mail.senderConfigured}`);
  console.log(`  RESEND_API_KEY     ${mail.resendApiKey ? 'present' : 'absent'}`);
  console.log(`  MAIL_HOST          ${mail.smtp?.host ?? '(unset)'}`);
  console.log(`  app url            ${health.appUrl}`);
  console.log('');

  if (mail.canSend) ok('the application reports that it can send email');
  else bad('the application reports that it CANNOT send email');

  if (mail.problem) note(`problem: ${mail.problem}`);
  if (mail.warning) note(`warning: ${mail.warning}`);

  if (mail.transport === 'resend') {
    ok('using Resend — no SMTP connection is attempted');
  } else if (mail.transport === 'smtp') {
    const host = mail.smtp?.host ?? '';
    if (/^(localhost|::1|\[::1\]|0\.0\.0\.0|127\.)/.test(host.trim().toLowerCase())) {
      bad(`SMTP is pointed at ${host}, which only works on the machine running the code`);
      note('Set RESEND_API_KEY and EMAIL_FROM, and remove MAIL_HOST from this environment.');
    } else {
      ok(`using SMTP via ${host}`);
    }
  } else if (mail.transport === 'log') {
    note('development mail mode: codes go to the server log, no email is sent');
  }
}

console.log('\n=== Resend sender verification ===\n');

const key = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? process.env.MAIL_FROM_ADDRESS ?? process.env.MAIL_FROM;

if (!key) {
  note('RESEND_API_KEY is not set in THIS shell, so the sender cannot be checked here.');
  note('That says nothing about the deployment — set it locally, or check the');
  note('Domains page in the Resend dashboard.');
} else {
  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      /*
       * Resend answers a malformed key with 400 "API key is invalid" and a
       * missing one with 401 "Missing API Key" — so the status alone does not
       * identify an auth problem, and checking only for 401 reports a bad key
       * as an unexplained failure. The message is what distinguishes them.
       */
      const reason = body?.message ?? `HTTP ${response.status}`;

      if (/api[_ -]?key/i.test(`${body?.name ?? ''} ${reason}`)) {
        bad(`Resend rejected the API key: ${reason} (HTTP ${response.status}).`);
        note('Generate a key in the Resend dashboard and set RESEND_API_KEY.');
      } else {
        bad(`Resend returned ${response.status} when listing domains: ${reason}`);
      }
    } else {
      ok('the API key is valid');

      const domains = body?.data ?? [];

      if (domains.length === 0) {
        bad('no domains are registered with this Resend account');
        note('Resend will then only deliver to the account owner\'s own address.');
        note('Add and verify a domain, then set EMAIL_FROM to an address on it.');
      } else {
        for (const domain of domains) {
          const verified = domain.status === 'verified';
          console.log(`  ${verified ? 'ok   ' : 'FAIL '} ${domain.name} — ${domain.status}`);
          if (!verified) problems += 1;
        }
      }

      const senderDomain = domainOf(from);
      console.log('');

      if (!senderDomain) {
        bad('EMAIL_FROM is not set in this shell, so the sender domain cannot be compared');
      } else if (domains.some((d) => d.name?.toLowerCase() === senderDomain && d.status === 'verified')) {
        ok(`EMAIL_FROM uses ${senderDomain}, which is verified`);
      } else {
        bad(`EMAIL_FROM uses ${senderDomain}, which is not a verified domain on this account`);
        note('Resend will refuse the message with a 403, surfaced as EMAIL_SENDER_NOT_VERIFIED.');
      }
    }
  } catch (error) {
    bad(`could not reach Resend — ${error instanceof Error ? error.message : error}`);
  }
}

console.log(`\n${problems === 0 ? 'No problems found.' : `${problems} problem(s) found.`}\n`);
process.exit(problems === 0 ? 0 : 1);
