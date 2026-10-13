import { authorizePage, requireUser } from '@/server/auth/current-user';
import { studentAccountPolicy } from '@/server/auth/policies';
import { prisma } from '@/server/lib/prisma';
import { listStudentAccounts, STUDENT_ACCOUNT_STATE_LABELS, type StudentAccountState } from '@/server/services/student-accounts';
import { YEAR_LEVELS } from '@shared/lib/teaching';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Student Accounts — enrolled students and their login accounts, for the Admin. */
export async function loadStudentAccounts({ query }: PageRequest) {
  const user = await requireUser();
  authorizePage(studentAccountPolicy.viewAny(user));

  const id = (v?: string) => (v && /^\d+$/.test(v) ? BigInt(v) : undefined);
  const num = (v: string | undefined, ok: readonly number[]) => (v && ok.includes(Number(v)) ? Number(v) : undefined);
  const states = Object.keys(STUDENT_ACCOUNT_STATE_LABELS) as StudentAccountState[];
  const filters = {
    programId: id(query.programId),
    schoolYear: query.schoolYear && /^\d{4}-\d{4}$/.test(query.schoolYear) ? query.schoolYear : undefined,
    semester: num(query.semester, [1, 2]),
    yearLevel: num(query.yearLevel, YEAR_LEVELS),
    account: states.includes(query.account as StudentAccountState) ? (query.account as StudentAccountState) : undefined,
    search: query.search?.trim().slice(0, 100) || undefined,
    page: Math.max(1, Number(query.page) || 1),
  };

  const [data, programs, terms] = await Promise.all([
    listStudentAccounts(filters),
    prisma.program.findMany({ orderBy: { code: 'asc' }, select: { id: true, code: true } }),
    prisma.enrollment.findMany({ where: { status: 'enrolled' }, distinct: ['schoolYear'], select: { schoolYear: true }, orderBy: { schoolYear: 'desc' } }),
  ]);

  return {
    ...data,
    programs: programs.map((p) => ({ id: p.id.toString(), code: p.code })),
    schoolYears: terms.map((t) => t.schoolYear),
    stateLabels: STUDENT_ACCOUNT_STATE_LABELS,
    query: Object.fromEntries(Object.entries(query).filter(([k, v]) => v && k !== 'page')) as Record<string, string>,
  };
}
