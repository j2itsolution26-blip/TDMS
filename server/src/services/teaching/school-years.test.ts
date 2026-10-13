import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Archiving a school year. The live end-to-end run archives a throwaway year
 * only — it must never touch the institution's real active year — so the part
 * it cannot exercise lives here: archive AND open the next year, in one
 * transaction, and the refusals that come first.
 */

const state = vi.hoisted(() => ({
  years: [] as { id: bigint; label: string; status: string; currentSemester: number; startsOn?: Date; endsOn?: Date }[],
  counts: {} as Record<string, number>,
  notified: [] as string[],
}));

vi.mock('@/server/lib/prisma', () => {
  const count = (name: string) => async () => state.counts[name] ?? 0;
  const schoolYear = {
    findUnique: async ({ where }: { where: { id?: bigint; label?: string } }) =>
      state.years.find((y) => (where.id !== undefined ? y.id === where.id : y.label === where.label)) ?? null,
    update: async ({ where, data }: { where: { id: bigint }; data: Record<string, unknown> }) => {
      const y = state.years.find((r) => r.id === where.id)!;
      Object.assign(y, data);
      return y;
    },
    create: async ({ data }: { data: { label: string; status: string; currentSemester: number } }) => {
      const y = { id: BigInt(state.years.length + 100), ...data };
      state.years.push(y);
      return y;
    },
  };
  const tx = {
    schoolYear,
    modelHasRole: { findMany: async () => [{ modelId: 7n }] },
    user: { findMany: async () => [{ id: 7n }] },
    notification: { createMany: async ({ data }: { data: { title: string }[] }) => { state.notified.push(...data.map((d) => d.title)); } },
  };
  return {
    prisma: {
      schoolYear,
      attendanceSession: { count: count('openSessions') },
      classOffering: { count: count('classes') },
      assessment: { count: count('assessments') },
      enrollment: { count: count('enrollments') },
      studentStatusRequest: { count: count('requests') },
      academicDocument: { count: count('documents') },
      // A real rollback: work on a copy, keep it only if the callback succeeds.
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        const before = structuredClone(state.years);
        try {
          return await fn(tx);
        } catch (e) {
          state.years = before;
          throw e;
        }
      },
    },
  };
});
vi.mock('@/server/services/audit-log', () => ({ recordAudit: vi.fn(async () => undefined), actorLabel: () => 'Dino Director <d@example.test>' }));

const { archiveSchoolYear } = await import('./school-years');
const director = { id: '1', name: 'Dino', roles: ['director'] } as never;
const next = { startsOn: new Date('2027-06-01'), endsOn: new Date('2028-05-31') };

beforeEach(() => {
  state.years = [{ id: 1n, label: '2026-2027', status: 'ACTIVE', currentSemester: 2 }];
  state.counts = {};
  state.notified = [];
});

describe('archiving a school year', () => {
  it('archives it and opens the next as ACTIVE, semester 1, in one step', async () => {
    const result = await archiveSchoolYear(director, 1n, { acknowledge: false, next });
    expect(result.archived.status).toBe('ARCHIVED');
    expect(result.next?.label).toBe('2027-2028');
    expect(result.next?.status).toBe('ACTIVE');
    expect(result.next?.currentSemester).toBe(1);
    expect(state.years.filter((y) => y.status === 'ACTIVE')).toHaveLength(1);
    expect(state.notified[0]).toContain('2026-2027 archived');
  });

  it('reuses an UPCOMING next year that was created in advance', async () => {
    state.years.push({ id: 2n, label: '2027-2028', status: 'UPCOMING', currentSemester: 1 });
    const result = await archiveSchoolYear(director, 1n, { acknowledge: false, next });
    expect(result.next?.id).toBe(2n);
    expect(state.years).toHaveLength(2);
  });

  it('refuses while an attendance session is still open', async () => {
    state.counts.openSessions = 1;
    await expect(archiveSchoolYear(director, 1n, { acknowledge: true, next })).rejects.toMatchObject({ code: 'ARCHIVE_BLOCKED' });
    expect(state.years[0]!.status).toBe('ACTIVE');
  });

  it('asks for acknowledgement of outstanding work, then proceeds', async () => {
    state.counts.assessments = 3;
    await expect(archiveSchoolYear(director, 1n, { acknowledge: false, next })).rejects.toMatchObject({ code: 'ARCHIVE_NEEDS_ACK' });
    expect(state.years[0]!.status).toBe('ACTIVE');
    await expect(archiveSchoolYear(director, 1n, { acknowledge: true, next })).resolves.toBeTruthy();
  });

  it('leaves nothing half-done if the next year is already archived', async () => {
    state.years.push({ id: 2n, label: '2027-2028', status: 'ARCHIVED', currentSemester: 1 });
    await expect(archiveSchoolYear(director, 1n, { acknowledge: false, next })).rejects.toThrow(/already archived/);
    expect(state.years.find((y) => y.id === 1n)!.status).toBe('ACTIVE');
  });

  it('refuses to archive a year twice', async () => {
    state.years[0]!.status = 'ARCHIVED';
    await expect(archiveSchoolYear(director, 1n, { acknowledge: true, next: null })).rejects.toThrow(/already archived/);
  });
});
