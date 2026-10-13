/**
 * An in-memory stand-in for the Prisma client, for tests only.
 *
 * `npm test` is offline by design (see vitest.config.ts), but the ordering
 * guarantee the Super Admin bootstrap rests on — that no account exists before
 * a verification code has been accepted — is a property of how the service
 * sequences its writes, not of any pure function. Asserting it needs something
 * that behaves like the database.
 *
 * So this implements exactly the subset of the client the service touches, and
 * two behaviours that matter for the properties under test:
 *
 *   * `$transaction` really rolls back. The store is snapshotted before the
 *     callback and restored if it throws, so a test can assert that a failure
 *     part-way through leaves no user behind.
 *   * `where` clauses are matched rather than ignored, including the
 *     conditional forms the service relies on for safety —
 *     `{ verifiedAt: null }` and `{ verifiedAt: { not: null } }` are what make
 *     a double-submitted form harmless, and a fake that waved them through
 *     would make a broken implementation look correct.
 *
 * It is not a general-purpose fake and should not grow into one. Anything it
 * does not implement throws, loudly, rather than returning a plausible empty
 * result.
 */

type Row = Record<string, unknown>;

interface Store {
  users: Row[];
  roles: Row[];
  modelHasRoles: Row[];
  pending: Row[];
  sessions: Row[];
  cache: Row[];
  auditLogs: Row[];
  adminAccessCodes: Row[];
  adminLoginChallenges: Row[];
  temporaryCredentials: Row[];
  installations: Row[];
}

function emptyStore(): Store {
  return {
    users: [],
    roles: [],
    modelHasRoles: [],
    pending: [],
    sessions: [],
    cache: [],
    auditLogs: [],
    adminAccessCodes: [],
    adminLoginChallenges: [],
    temporaryCredentials: [],
    installations: [],
  };
}

/** Does this row satisfy a Prisma-style `where`? */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (key === 'OR') {
      const clauses = condition as Row[];
      if (!clauses.some((clause) => matches(row, clause))) return false;
      continue;
    }

    const value = row[key];

    if (condition === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }

    if (condition instanceof Date) {
      if (!(value instanceof Date) || value.getTime() !== condition.getTime()) return false;
      continue;
    }

    if (typeof condition === 'object') {
      const operators = condition as Record<string, unknown>;

      if ('not' in operators) {
        if (operators.not === null) {
          if (value === null || value === undefined) return false;
        } else if (value === operators.not) {
          return false;
        }
      }

      /*
       * A comparison against NULL is never true, exactly as in SQL. Getting
       * this wrong would make `{ verifiedAt: { lte: cutoff } }` match every
       * unverified row — which is a pruning query that deletes registrations
       * somebody is still using.
       */
      if ('in' in operators) {
        const allowed = operators.in as unknown[];
        // Compared as strings so a BigInt id matches its own value.
        if (!allowed.some((candidate) => String(candidate) === String(value))) return false;
      }

      if ('startsWith' in operators) {
        if (typeof value !== 'string') return false;
        if (!value.startsWith(String(operators.startsWith))) return false;
      }

      /*
       * The four range operators share one comparison, and all four agree
       * with SQL that a comparison against NULL is never true. Getting that
       * wrong would make `{ expiresAt: { gt: now } }` match a row with no
       * expiry — which for an access code is the difference between "live"
       * and "never expires".
       */
      const RANGES: Record<string, (left: number, right: number) => boolean> = {
        lte: (l, r) => l <= r,
        lt: (l, r) => l < r,
        gte: (l, r) => l >= r,
        gt: (l, r) => l > r,
      };

      for (const [op, compare] of Object.entries(RANGES)) {
        if (!(op in operators)) continue;
        if (value === null || value === undefined) return false;
        const bound = operators[op] as Date | number;
        const left = value instanceof Date ? value.getTime() : Number(value);
        const right = bound instanceof Date ? bound.getTime() : Number(bound);
        if (!compare(left, right)) return false;
      }

      const unsupported = Object.keys(operators).filter(
        (op) => !['not', 'lte', 'lt', 'gte', 'gt', 'in', 'startsWith'].includes(op),
      );
      if (unsupported.length > 0) {
        throw new Error(`fake-prisma: unsupported operator(s) ${unsupported.join(', ')}`);
      }

      continue;
    }

    if (value !== condition) return false;
  }

  return true;
}

/** Apply a Prisma-style `data`, honouring `{ increment }`. */
function applyData(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as Row)) {
      row[key] = Number(row[key] ?? 0) + Number((value as Row).increment);
      continue;
    }
    row[key] = value;
  }
  row.updatedAt = new Date();
}

/**
 * Sort a result set the way a single-key Prisma `orderBy` would.
 *
 * Only one key, because that is all the services ask for — and a fake that
 * silently ignored orderBy would be actively misleading here: "the newest
 * access code for this admin" is the query the whole single-use property
 * rests on, and returning the oldest instead would make a broken
 * implementation look correct.
 */
function sortRows(rows: Row[], orderBy: Row | undefined): Row[] {
  if (!orderBy) return rows;

  const entries = Object.entries(orderBy);
  if (entries.length === 0) return rows;
  if (entries.length > 1) {
    throw new Error('fake-prisma: only a single-key orderBy is implemented');
  }

  const [key, direction] = entries[0] as [string, string];
  const sign = direction === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;

    const l = left instanceof Date ? left.getTime() : left;
    const r = right instanceof Date ? right.getTime() : right;

    if (typeof l === 'bigint' || typeof r === 'bigint') {
      return BigInt(l as bigint) < BigInt(r as bigint) ? -sign : sign;
    }
    if (typeof l === 'number' && typeof r === 'number') return l < r ? -sign : sign;
    return String(l) < String(r) ? -sign : sign;
  });
}

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map(clone) as unknown as T;

  const out: Row = {};
  for (const [k, v] of Object.entries(value as Row)) out[k] = clone(v);
  return out as unknown as T;
}

export interface FakePrisma {
  prisma: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  store: Store;
  reset: () => void;
}

export function createFakePrisma(): FakePrisma {
  /*
   * One store object for the lifetime of the fake, mutated in place. Both
   * `reset` and a transaction rollback replace the CONTENTS of its arrays
   * rather than the arrays themselves, so a test that holds a reference to the
   * store keeps seeing the live data.
   */
  const store = emptyStore();
  let nextId = 1n;

  /** Serializes transactions; see `$transaction` below. */
  let gate: Promise<void> = Promise.resolve();

  function table(name: keyof Store): Row[] {
    return store[name];
  }

  /** Overwrite every table in place from a snapshot. */
  function restore(snapshot: Store): void {
    for (const key of Object.keys(store) as (keyof Store)[]) {
      store[key].length = 0;
      store[key].push(...snapshot[key]);
    }
  }

  /**
   * The shared CRUD shape, over one array.
   *
   * `hydrate` attaches the one relation the services actually read back — the
   * Spatie role join. Prisma resolves `select: { role: { ... } }` by following
   * the foreign key; a fake that ignored it would hand back rows without a
   * `role` property and turn a correct implementation into a TypeError, which
   * is a worse failure than not supporting it at all.
   */
  function model(
    name: keyof Store,
    defaults: () => Row = () => ({}),
    hydrate: (row: Row) => Row = (row) => row,
  ) {
    const read = (row: Row | null | undefined) => (row ? hydrate(clone(row)) : null);

    return {
      findUnique: async ({ where }: { where: Row }) =>
        read(table(name).find((row) => matches(row, where))),

      findFirst: async ({ where, orderBy }: { where?: Row; orderBy?: Row } = {}) =>
        read(sortRows(table(name).filter((row) => matches(row, where)), orderBy)[0]),

      findMany: async ({
        where,
        orderBy,
        skip,
        take,
      }: { where?: Row; orderBy?: Row; skip?: number; take?: number } = {}) => {
        const found = sortRows(table(name).filter((row) => matches(row, where)), orderBy);
        const from = skip ?? 0;
        const page = take === undefined ? found.slice(from) : found.slice(from, from + take);
        return page.map((row) => hydrate(clone(row)));
      },

      create: async ({ data }: { data: Row }) => {
        const row: Row = { id: nextId++, ...defaults(), ...data };
        table(name).push(row);
        return clone(row);
      },

      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = table(name).find((r) => matches(r, where));
        if (!row) throw new Error(`fake-prisma: ${name}.update matched no row`);
        applyData(row, data);
        return clone(row);
      },

      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const rows = table(name).filter((r) => matches(r, where));
        for (const row of rows) applyData(row, data);
        return { count: rows.length };
      },

      upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
        /*
         * Prisma's compound-unique form arrives as { name_guardName: {...} };
         * flatten it so the same matcher can be used.
         */
        const flat: Row = {};
        for (const [key, value] of Object.entries(where)) {
          if (value && typeof value === 'object' && !(value instanceof Date)) {
            Object.assign(flat, value as Row);
          } else {
            flat[key] = value;
          }
        }

        const existing = table(name).find((r) => matches(r, flat));
        if (existing) {
          applyData(existing, update);
          return clone(existing);
        }

        const row: Row = { id: nextId++, ...defaults(), ...flat, ...create };
        table(name).push(row);
        return clone(row);
      },

      deleteMany: async ({ where }: { where?: Row } = {}) => {
        const rows = table(name);
        const keep = rows.filter((row) => !matches(row, where));
        const removed = rows.length - keep.length;
        rows.length = 0;
        rows.push(...keep);
        return { count: removed };
      },

      delete: async ({ where }: { where: Row }) => {
        const index = table(name).findIndex((row) => matches(row, where));
        if (index === -1) throw new Error(`fake-prisma: ${name}.delete matched no row`);
        const [row] = table(name).splice(index, 1);
        return clone(row!);
      },

      count: async ({ where }: { where?: Row } = {}) =>
        table(name).filter((row) => matches(row, where)).length,
    };
  }

  const prisma: Record<string, any> = {  // eslint-disable-line @typescript-eslint/no-explicit-any
    user: model('users', () => ({ emailVerifiedAt: null, status: 'PENDING', isActive: true })),
    role: model('roles'),
    /*
     * `role` is resolved from roleId, so `select: { role: { select: { name,
     * guardName } } }` behaves as Prisma's does. The permissions side of the
     * join is deliberately not implemented: nothing under test reads it, and a
     * fake that returned an empty permission list would make an authorization
     * bug look like a pass.
     */
    modelHasRole: model('modelHasRoles', () => ({}), (row) => {
      const role = store.roles.find((r) => String(r.id) === String(row.roleId));
      return role ? { ...row, role: clone(role) } : row;
    }),
    pendingAdminRegistration: model('pending', () => ({
      verificationAttempts: 0,
      resendCount: 0,
      verifiedAt: null,
      lastSentAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    session: model('sessions'),
    legacyCache: model('cache'),
    auditLog: model('auditLogs'),
    adminAccessCode: model('adminAccessCodes', () => ({
      usedAt: null,
      revokedAt: null,
      revokedReason: null,
      revokedBy: null,
      attemptCount: 0,
      createdAt: new Date(),
    })),
    temporaryCredential: model('temporaryCredentials', () => ({
      usedAt: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: new Date(),
    })),
    /*
     * The one table whose primary key the code relies on: a second insert of
     * id 1 is how a losing first-run setup is refused, so the fake fails it
     * exactly as PostgreSQL would — a P2002 — rather than appending a twin.
     */
    systemInstallation: (() => {
      const base = model('installations');
      return {
        ...base,
        create: async (args: { data: Row }) => {
          const id = args.data.id ?? 1;
          if (store.installations.some((row) => row.id === id)) {
            const { Prisma } = await import('@prisma/client');
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`id`)',
              { code: 'P2002', clientVersion: 'fake' },
            );
          }
          const row: Row = { ...args.data, id };
          store.installations.push(row);
          return clone(row);
        },
      };
    })(),
    adminLoginChallenge: model('adminLoginChallenges', () => ({
      remember: false,
      consumedAt: null,
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
    })),

    /**
     * Real rollback, and one transaction at a time.
     *
     * The store is snapshotted and restored on failure, so a test can assert
     * that a transaction which throws leaves nothing behind.
     *
     * Transactions are also serialized through `gate`, which is what the
     * service asks for with `isolationLevel: 'Serializable'`. Letting two
     * interleave here would be worse than unrealistic: the loser's rollback
     * would restore a snapshot taken before the winner's writes and silently
     * undo them.
     */
    $transaction: async (arg: unknown) => {
      /*
       * The array form: the operations were already started when the caller
       * built the array, so this only waits for them. There is no rollback for
       * it here — the services that use it (role sync) do two writes that
       * cannot half-fail in memory.
       */
      if (Array.isArray(arg)) return Promise.all(arg);

      if (typeof arg !== 'function') {
        throw new Error('fake-prisma: $transaction needs a callback or an array');
      }

      const run = gate.then(async () => {
        const snapshot = clone(store);
        try {
          return await (arg as (tx: unknown) => Promise<unknown>)(prisma);
        } catch (error) {
          restore(snapshot);
          throw error;
        }
      });

      // Keep the queue moving whether this one committed or rolled back.
      gate = run.then(
        () => undefined,
        () => undefined,
      );

      return run;
    },
  };

  return {
    prisma,
    store,
    reset() {
      restore(emptyStore());
      nextId = 1n;
    },
  };
}
