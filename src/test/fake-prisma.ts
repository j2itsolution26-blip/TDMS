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
      if ('lte' in operators) {
        if (value === null || value === undefined) return false;
        const bound = operators.lte as Date | number;
        const left = value instanceof Date ? value.getTime() : Number(value);
        const right = bound instanceof Date ? bound.getTime() : Number(bound);
        if (!(left <= right)) return false;
      }

      if ('gte' in operators) {
        if (value === null || value === undefined) return false;
        const bound = operators.gte as Date | number;
        const left = value instanceof Date ? value.getTime() : Number(value);
        const right = bound instanceof Date ? bound.getTime() : Number(bound);
        if (!(left >= right)) return false;
      }

      const unsupported = Object.keys(operators).filter(
        (op) => !['not', 'lte', 'gte'].includes(op),
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

  /** The shared CRUD shape, over one array. */
  function model(name: keyof Store, defaults: () => Row = () => ({})) {
    return {
      findUnique: async ({ where }: { where: Row }) =>
        clone(table(name).find((row) => matches(row, where)) ?? null),

      findFirst: async ({ where }: { where?: Row }) =>
        clone(table(name).find((row) => matches(row, where)) ?? null),

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
    modelHasRole: model('modelHasRoles'),
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
      if (typeof arg !== 'function') {
        throw new Error('fake-prisma: only the callback form of $transaction is implemented');
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
