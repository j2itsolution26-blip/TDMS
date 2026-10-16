import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { openPendingEnrollment, registrationTerm, type RegistrationTerm } from './registration-enrollment';
import { ensureCredentialChecklist, fullName, isUniqueViolation, nextStudentNumber } from './student-service';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import { prisma } from '@/server/lib/prisma';
import { AppError, NotFoundError } from '@/server/lib/http';
import { checkUpload, deleteStored, readStored, storeUpload } from '@/server/lib/storage';
import type { applicationSchema, applicationDocumentStatusSchema, approveApplicationSchema } from '@/server/schemas/schemas';
import type { AuthUser } from '@shared/types/domain';
import { APPLICATION_STATUSES } from '@shared/types/domain';
import {
  OPEN_STATUSES, applicationNumber, approvalProblems, canTransition, documentProgress, isEditable,
  isHandedIn, statusesFor, submissionProblems, type ApplicationAction, type RequirementState,
} from '@shared/lib/applications';

/**
 * Admission applications: recording (draft), submission, review, and the
 * decision. Approval creates or links the Student and opens a PENDING
 * enrollment — it never enrolls anyone (that stays with Enrollments).
 *
 * Every status change is a guarded UPDATE … WHERE status IN (allowed), so two
 * reviewers pressing Approve at once cannot both succeed, and a decided
 * application can never be decided again.
 */

const PAGE_SIZE = 10;
type Db = Prisma.TransactionClient | typeof prisma;
type ApplicationInput = z.infer<typeof applicationSchema>;

// --- Requirements -------------------------------------------------------------

/** The active requirements that apply to a program: the global ones and its own. */
async function requirementsFor(programId: bigint, db: Db = prisma) {
  return db.credentialRequirement.findMany({
    where: { isActive: true, OR: [{ programId: null }, { programId }] },
    orderBy: [{ isRequired: 'desc' }, { id: 'asc' }],
    select: { id: true, name: true, isRequired: true, programId: true },
  });
}

function requirementStates(
  requirements: { id: bigint; name: string; isRequired: boolean }[],
  documents: { credentialRequirementId: bigint; status: string }[],
): RequirementState[] {
  const byReq = new Map(documents.map((d) => [d.credentialRequirementId.toString(), d.status]));
  return requirements.map((r) => ({ id: r.id.toString(), name: r.name, isRequired: r.isRequired, status: byReq.get(r.id.toString()) ?? 'pending' }));
}

// --- Listing ------------------------------------------------------------------

export interface ApplicationFilters {
  page?: number;
  status?: string;
  search?: string;
  programId?: bigint;
  schoolYearId?: bigint;
  /** Submission date range, YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
}

function dayStart(iso: string) { return new Date(`${iso}T00:00:00`); }
function dayAfter(iso: string) { const d = dayStart(iso); d.setDate(d.getDate() + 1); return d; }
const isIsoDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dayStart(v).getTime());

export async function listApplications(options: ApplicationFilters = {}) {
  const page = options.page ?? 1;
  const and: Prisma.ApplicationWhereInput[] = [];
  if (options.status && (APPLICATION_STATUSES as readonly string[]).includes(options.status)) and.push({ status: options.status });
  if (options.programId) and.push({ programId: options.programId });
  if (options.schoolYearId) and.push({ schoolYearId: options.schoolYearId });
  if (isIsoDate(options.from)) and.push({ submittedAt: { gte: dayStart(options.from!) } });
  if (isIsoDate(options.to)) and.push({ submittedAt: { lt: dayAfter(options.to!) } });
  // Every word must match a name part, the number, the email or the phone —
  // the phone by its digits, so 09171234567 finds "0917 123 4567".
  for (const word of (options.search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 5)) {
    const digits = word.replace(/\D/g, '');
    const byPhone = digits.length >= 4
      ? (await prisma.$queryRaw<{ id: bigint }[]>`SELECT id FROM applications WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`} LIMIT 500`).map((r) => r.id)
      : [];
    and.push({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' } },
        { middleName: { contains: word, mode: 'insensitive' } },
        { lastName: { contains: word, mode: 'insensitive' } },
        { applicationNumber: { contains: word, mode: 'insensitive' } },
        { email: { contains: word, mode: 'insensitive' } },
        ...(byPhone.length ? [{ id: { in: byPhone } }] : []),
      ],
    });
  }
  const where: Prisma.ApplicationWhereInput = and.length ? { AND: and } : {};

  const [rows, total, requirements] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        program: { select: { id: true, name: true, code: true } },
        schoolYear: { select: { id: true, label: true } },
        reviewer: { select: { name: true } },
        student: { select: { id: true, studentNumber: true } },
        documents: { select: { credentialRequirementId: true, status: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.application.count({ where }),
    prisma.credentialRequirement.findMany({ where: { isActive: true }, select: { id: true, name: true, isRequired: true, programId: true } }),
  ]);

  return {
    rows: rows.map((a) => {
      const applicable = requirements.filter((r) => r.programId === null || r.programId === a.programId);
      return {
        id: a.id.toString(),
        applicationNumber: a.applicationNumber,
        fullName: displayName(a),
        email: a.email,
        phone: a.phone,
        status: a.status,
        notes: a.notes,
        createdAt: a.createdAt?.toISOString() ?? null,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
        program: { id: a.program.id.toString(), name: a.program.name, code: a.program.code },
        schoolYear: a.schoolYear ? { id: a.schoolYear.id.toString(), label: a.schoolYear.label } : null,
        reviewer: a.reviewer ? { name: a.reviewer.name } : null,
        student: a.student ? { id: a.student.id.toString(), studentNumber: a.student.studentNumber } : null,
        documents: documentProgress(requirementStates(applicable, a.documents)),
      };
    }),
    page,
    pageSize: PAGE_SIZE,
    total,
    lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Counts per status for the KPI cards; `total` is every application, drafts included. */
export async function applicationCounts() {
  const rows = await prisma.application.groupBy({ by: ['status'], _count: { _all: true } });
  const out: Record<string, number> = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const r of rows) out[r.status] = (out[r.status] ?? 0) + r._count._all;
  return { ...out, total: rows.reduce((n, r) => n + r._count._all, 0) } as Record<(typeof APPLICATION_STATUSES)[number] | 'total', number>;
}

function displayName(a: { firstName: string; middleName: string | null; lastName: string; suffix?: string | null }) {
  return [fullName(a), a.suffix].filter(Boolean).join(' ');
}

// --- One application ------------------------------------------------------------

async function loadApplication(id: bigint, db: Db = prisma) {
  const application = await db.application.findUnique({ where: { id } });
  if (!application) throw new NotFoundError('Application not found.');
  return application;
}

export async function getApplication(id: bigint) {
  return loadApplication(id);
}

/** Students this applicant may already be: same email, or same name and date of birth. */
async function studentMatches(
  a: { email: string | null; firstName: string; lastName: string; dateOfBirth: Date | null },
  db: Db = prisma,
) {
  const or: Prisma.StudentWhereInput[] = [];
  if (a.email) or.push({ email: { equals: a.email, mode: 'insensitive' } });
  if (a.dateOfBirth) {
    or.push({
      firstName: { equals: a.firstName, mode: 'insensitive' },
      lastName: { equals: a.lastName, mode: 'insensitive' },
      dateOfBirth: a.dateOfBirth,
    });
  }
  if (or.length === 0) return [];
  const rows = await db.student.findMany({
    where: { OR: or },
    take: 5,
    orderBy: { id: 'asc' },
    select: { id: true, studentNumber: true, firstName: true, middleName: true, lastName: true, email: true, status: true, programId: true, program: { select: { code: true } } },
  });
  return rows.map((s) => ({
    id: s.id.toString(),
    studentNumber: s.studentNumber,
    fullName: fullName(s),
    email: s.email,
    status: s.status,
    programId: s.programId.toString(),
    programCode: s.program.code,
  }));
}

export async function applicationDetail(id: bigint) {
  const a = await prisma.application.findUnique({
    where: { id },
    include: {
      program: { select: { id: true, name: true, code: true } },
      schoolYear: { select: { id: true, label: true, status: true } },
      reviewer: { select: { name: true } },
      student: { select: { id: true, studentNumber: true } },
      documents: true,
    },
  });
  if (!a) throw new NotFoundError('Application not found.');

  const requirements = await requirementsFor(a.programId);
  const userIds = [a.createdBy, ...a.documents.flatMap((d) => [d.submittedBy, d.verifiedBy])].filter((v): v is bigint => v !== null);
  const users = userIds.length
    ? new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id.toString(), u.name]))
    : new Map<string, string>();
  const byReq = new Map(a.documents.map((d) => [d.credentialRequirementId.toString(), d]));
  const states = requirementStates(requirements, a.documents);
  const undecided = a.status === 'submitted' || a.status === 'under_review';

  return {
    id: a.id.toString(),
    applicationNumber: a.applicationNumber,
    fullName: displayName(a),
    firstName: a.firstName,
    middleName: a.middleName,
    lastName: a.lastName,
    suffix: a.suffix,
    email: a.email,
    phone: a.phone,
    dateOfBirth: a.dateOfBirth ? a.dateOfBirth.toISOString().slice(0, 10) : null,
    address: a.address,
    emergencyContactName: a.emergencyContactName,
    emergencyContactPhone: a.emergencyContactPhone,
    highestEducation: a.highestEducation,
    previousSchool: a.previousSchool,
    yearGraduated: a.yearGraduated,
    educationNotes: a.educationNotes,
    status: a.status,
    notes: a.notes,
    createdAt: a.createdAt?.toISOString() ?? null,
    submittedAt: a.submittedAt?.toISOString() ?? null,
    reviewedAt: a.reviewedAt?.toISOString() ?? null,
    createdBy: a.createdBy ? users.get(a.createdBy.toString()) ?? null : null,
    program: { id: a.program.id.toString(), name: a.program.name, code: a.program.code },
    schoolYear: a.schoolYear ? { id: a.schoolYear.id.toString(), label: a.schoolYear.label, status: a.schoolYear.status } : null,
    reviewer: a.reviewer ? { name: a.reviewer.name } : null,
    student: a.student ? { id: a.student.id.toString(), studentNumber: a.student.studentNumber } : null,
    requirements: requirements.map((r) => {
      const d = byReq.get(r.id.toString());
      return {
        requirementId: r.id.toString(),
        name: r.name,
        isRequired: r.isRequired,
        documentId: d?.id.toString() ?? null,
        status: d?.status ?? 'pending',
        file: d?.fileKey ? { name: d.fileName ?? 'file', type: d.fileType, size: d.fileSize } : null,
        remarks: d?.remarks ?? null,
        submittedAt: d?.submittedAt?.toISOString() ?? null,
        submittedBy: d?.submittedBy ? users.get(d.submittedBy.toString()) ?? null : null,
        verifiedAt: d?.verifiedAt?.toISOString() ?? null,
        verifiedBy: d?.verifiedBy ? users.get(d.verifiedBy.toString()) ?? null : null,
      };
    }),
    progress: documentProgress(states),
    /** What stops a submission or an approval right now, for the screens to show. */
    submissionProblems: canTransition(a.status, 'submit') ? submissionProblems(fieldsOf(a), states) : {},
    approvalProblems: undecided ? approvalProblems(states) : [],
    possibleStudents: undecided ? await studentMatches(a) : [],
  };
}

function fieldsOf(a: { firstName: string; lastName: string; dateOfBirth: Date | null; email: string | null; phone: string | null; address: string | null; programId: bigint; schoolYearId: bigint | null; highestEducation: string | null; previousSchool: string | null }) {
  return {
    firstName: a.firstName, lastName: a.lastName, dateOfBirth: a.dateOfBirth, email: a.email, phone: a.phone, address: a.address,
    programId: a.programId, schoolYearId: a.schoolYearId, highestEducation: a.highestEducation, previousSchool: a.previousSchool,
  };
}

// --- Recording and editing ---------------------------------------------------------

async function assertReferences(input: ApplicationInput, db: Db) {
  const program = await db.program.findUnique({ where: { id: input.programId }, select: { isActive: true } });
  if (!program) throw new AppError('The selected program does not exist.', 422, { programId: ['The selected program does not exist.'] });
  if (input.schoolYearId) {
    const year = await db.schoolYear.findUnique({ where: { id: input.schoolYearId }, select: { status: true, label: true } });
    if (!year) throw new AppError('The selected school year does not exist.', 422, { schoolYearId: ['The selected school year does not exist.'] });
    if (year.status === 'ARCHIVED') throw new AppError(`School year ${year.label} is archived.`, 422, { schoolYearId: [`School year ${year.label} is archived and takes no new applications.`] });
  }
}

/**
 * One open application per person. Serialised by an advisory lock on the
 * email (or name), so two saves of the same applicant at once cannot both pass.
 */
async function assertNoOpenDuplicate(input: ApplicationInput, db: Prisma.TransactionClient, exceptId?: bigint) {
  const key = (input.email ?? `${input.firstName} ${input.lastName}`).toLowerCase();
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`application:${key}`}))`;
  const or: Prisma.ApplicationWhereInput[] = [];
  if (input.email) or.push({ email: { equals: input.email, mode: 'insensitive' } });
  if (input.dateOfBirth) {
    or.push({ firstName: { equals: input.firstName, mode: 'insensitive' }, lastName: { equals: input.lastName, mode: 'insensitive' }, dateOfBirth: input.dateOfBirth });
  }
  if (or.length === 0) return;
  const existing = await db.application.findFirst({
    where: { OR: or, status: { in: [...OPEN_STATUSES] }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { applicationNumber: true, status: true },
  });
  if (existing) {
    const field = input.email ? 'email' : 'firstName';
    const message = `This applicant already has an open application (${existing.applicationNumber ?? 'unnumbered'}). Continue that one instead of recording a second.`;
    throw new AppError(message, 409, { [field]: [message] }, 'DUPLICATE_APPLICATION');
  }
}

function applicationData(input: ApplicationInput) {
  return {
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    suffix: input.suffix,
    email: input.email,
    phone: input.phone,
    dateOfBirth: input.dateOfBirth,
    address: input.address,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    programId: input.programId,
    schoolYearId: input.schoolYearId,
    highestEducation: input.highestEducation,
    previousSchool: input.previousSchool,
    yearGraduated: input.yearGraduated,
    educationNotes: input.educationNotes,
  };
}

/** Record a new application as a draft; submitting is a separate step. */
export async function createApplication(user: AuthUser, input: ApplicationInput, context?: AuditContext) {
  const created = await prisma.$transaction(async (tx) => {
    await assertReferences(input, tx);
    await assertNoOpenDuplicate(input, tx);
    const now = new Date();
    const row = await tx.application.create({
      data: { ...applicationData(input), status: 'draft', createdBy: BigInt(user.id), createdAt: now, updatedAt: now },
      select: { id: true },
    });
    const number = applicationNumber(now, row.id);
    await tx.application.update({ where: { id: row.id }, data: { applicationNumber: number } });
    return { id: row.id.toString(), applicationNumber: number, status: 'draft' as const };
  });
  await recordAudit({ action: 'application.created', actor: actorLabel(user), target: `Application ${created.applicationNumber}`, details: { status: 'draft' }, context });
  return created;
}

export async function updateApplication(user: AuthUser, id: bigint, input: ApplicationInput, context?: AuditContext) {
  const updated = await prisma.$transaction(async (tx) => {
    const current = await loadApplication(id, tx);
    if (!isEditable(current.status)) throw new AppError(`A ${current.status} application can no longer be changed.`, 409, undefined, 'APPLICATION_LOCKED');
    await assertReferences(input, tx);
    await assertNoOpenDuplicate(input, tx, id);
    const { count } = await tx.application.updateMany({
      where: { id, status: current.status },
      data: { ...applicationData(input), updatedAt: new Date() },
    });
    if (count === 0) throw new AppError('This application was changed by someone else. Reload it and try again.', 409, undefined, 'APPLICATION_CHANGED');
    return { id: id.toString(), applicationNumber: current.applicationNumber, status: current.status };
  });
  await recordAudit({ action: 'application.updated', actor: actorLabel(user), target: `Application ${updated.applicationNumber}`, context });
  return updated;
}

// --- Status changes ------------------------------------------------------------------

/** Move the status only if it is still one the action may start from. */
async function guardedTransition(db: Db, id: bigint, action: ApplicationAction, data: Prisma.ApplicationUncheckedUpdateManyInput) {
  const { count } = await db.application.updateMany({ where: { id, status: { in: statusesFor(action) } }, data: { ...data, updatedAt: new Date() } });
  if (count === 0) {
    const current = await db.application.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new NotFoundError('Application not found.');
    throw new AppError(`This application is ${current.status.replace('_', ' ')} — it cannot be ${PAST[action]} now.`, 409, undefined, 'APPLICATION_STATUS');
  }
}

const PAST: Record<ApplicationAction, string> = {
  submit: 'submitted', start_review: 'put under review', approve: 'approved', return: 'returned', reject: 'rejected',
};

export async function submitApplication(user: AuthUser, id: bigint, context?: AuditContext) {
  const a = await prisma.$transaction(async (tx) => {
    const a = await tx.application.findUnique({ where: { id }, include: { documents: { select: { credentialRequirementId: true, status: true } } } });
    if (!a) throw new NotFoundError('Application not found.');
    if (canTransition(a.status, 'submit')) {
      const problems = submissionProblems(fieldsOf(a), requirementStates(await requirementsFor(a.programId, tx), a.documents));
      if (Object.keys(problems).length > 0) {
        throw new AppError('Complete the highlighted details and documents before submitting.', 422, problems, 'SUBMISSION_INCOMPLETE');
      }
    }
    await guardedTransition(tx, id, 'submit', { status: 'submitted', submittedAt: new Date() });
    return a;
  });
  await recordAudit({ action: 'application.submitted', actor: actorLabel(user), target: `Application ${a.applicationNumber}`, details: { from: a.status }, context });
  return { id: id.toString(), status: 'submitted' as const };
}

export async function startReview(user: AuthUser, id: bigint, context?: AuditContext) {
  const a = await loadApplication(id);
  await guardedTransition(prisma, id, 'start_review', { status: 'under_review', reviewedBy: BigInt(user.id), reviewedAt: new Date() });
  await recordAudit({ action: 'application.review_started', actor: actorLabel(user), target: `Application ${a.applicationNumber}`, context });
  return { id: id.toString(), status: 'under_review' as const };
}

export async function returnApplication(user: AuthUser, id: bigint, reason: string, context?: AuditContext) {
  const a = await loadApplication(id);
  await guardedTransition(prisma, id, 'return', { status: 'returned', notes: reason, reviewedBy: BigInt(user.id), reviewedAt: new Date() });
  await recordAudit({ action: 'application.returned', actor: actorLabel(user), target: `Application ${a.applicationNumber}`, details: { reason }, context });
  return { id: id.toString(), status: 'returned' as const };
}

export async function rejectApplication(user: AuthUser, id: bigint, reason: string, context?: AuditContext) {
  const a = await loadApplication(id);
  await guardedTransition(prisma, id, 'reject', { status: 'rejected', notes: reason, reviewedBy: BigInt(user.id), reviewedAt: new Date() });
  await recordAudit({ action: 'application.rejected', actor: actorLabel(user), target: `Application ${a.applicationNumber}`, details: { reason }, context });
  return { id: id.toString(), status: 'rejected' as const };
}

// --- Approval ----------------------------------------------------------------------------

export interface ApproveResult {
  studentId: string;
  studentNumber: string;
  /** True when an existing student record was linked rather than created. */
  linked: boolean;
  enrollment: { id: string; term: string; created: boolean } | null;
}

/** The term the approved applicant enters: their chosen school year's current semester, else the active term. */
async function termFor(schoolYearId: bigint | null): Promise<RegistrationTerm | null> {
  if (!schoolYearId) return registrationTerm(null);
  const year = await prisma.schoolYear.findUnique({ where: { id: schoolYearId }, select: { currentSemester: true } });
  return registrationTerm({ schoolYearId, semester: year?.currentSemester ?? 1 });
}

/**
 * Approve: in one transaction, claim the application (guarded), check every
 * required document is verified, create the Student — or link the existing
 * one the reviewer chose — carry the documents into the student's checklist,
 * and open a PENDING enrollment for the chosen school year unless the student
 * already has one for that term. Any failure rolls all of it back.
 *
 * A possible existing student (same email, or same name and birth date) must
 * be decided on explicitly — link it, or createNew — so approval never makes
 * a duplicate student silently.
 */
export async function approveApplication(
  user: AuthUser,
  id: bigint,
  choice: z.infer<typeof approveApplicationSchema> = {},
  context?: AuditContext,
): Promise<ApproveResult> {
  const before = await loadApplication(id);
  const term = await termFor(before.schoolYearId);
  const actorId = BigInt(user.id);

  // Retried on a student-number collision, like createStudent: the unique index decides.
  const attempt = () => prisma.$transaction(async (tx) => {
    await guardedTransition(tx, id, 'approve', {
      status: 'approved',
      reviewedBy: actorId,
      reviewedAt: new Date(),
      ...(choice.remarks !== undefined ? { notes: choice.remarks } : {}),
    });
    const application = await tx.application.findUniqueOrThrow({ where: { id }, include: { documents: true } });

    const requirements = await requirementsFor(application.programId, tx);
    const blocking = approvalProblems(requirementStates(requirements, application.documents));
    if (blocking.length > 0) {
      throw new AppError(`Verify the required documents first: ${blocking.join(' ')}`, 422, { documents: blocking }, 'DOCUMENTS_NOT_VERIFIED');
    }

    // Who the applicant is: an existing student the reviewer chose, or a new one.
    let student: { id: bigint; studentNumber: string; curriculumId: bigint; yearLevel: number };
    let linked = false;
    if (choice.studentId) {
      const existing = await tx.student.findUnique({ where: { id: choice.studentId }, select: { id: true, studentNumber: true, curriculumId: true, yearLevel: true, programId: true, program: { select: { code: true } } } });
      if (!existing) throw new AppError('The chosen student record no longer exists.', 422, { studentId: ['Choose another student, or create a new one.'] });
      if (existing.programId !== application.programId) {
        throw new AppError(`Student ${existing.studentNumber} is in ${existing.program.code}. Change the application's program, or create a new student record.`, 422, { studentId: ['Different program.'] }, 'PROGRAM_MISMATCH');
      }
      const linkedElsewhere = await tx.application.findFirst({ where: { studentId: existing.id, programId: application.programId, status: 'approved', id: { not: id } }, select: { applicationNumber: true } });
      if (linkedElsewhere) {
        throw new AppError(`Student ${existing.studentNumber} was already admitted through ${linkedElsewhere.applicationNumber}.`, 409, undefined, 'ALREADY_ADMITTED');
      }
      student = existing;
      linked = true;
    } else {
      const matches = await studentMatches(application, tx);
      if (matches.length > 0 && !choice.createNew) {
        throw new AppError(
          `A student record may already exist for this applicant (${matches.map((m) => m.studentNumber).join(', ')}). Link it, or confirm a new record.`,
          409, undefined, 'STUDENT_MATCH',
        );
      }
      const curriculum = await tx.curriculum.findFirst({
        where: { programId: application.programId, isActive: true },
        orderBy: { effectiveSchoolYear: 'desc' },
        select: { id: true },
      });
      if (!curriculum) throw new AppError('This program has no active curriculum to enroll into.', 422);

      student = await tx.student.create({
        data: {
          studentNumber: await nextStudentNumber(tx),
          firstName: application.firstName,
          middleName: application.middleName,
          lastName: application.lastName,
          email: application.email,
          phone: application.phone,
          dateOfBirth: application.dateOfBirth,
          programId: application.programId,
          curriculumId: curriculum.id,
          yearLevel: 1,
          status: 'applicant',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true, studentNumber: true, curriculumId: true, yearLevel: true },
      });
    }

    // The documents follow the applicant; a verified credential is never overwritten.
    await ensureCredentialChecklist(student.id, tx);
    for (const d of application.documents) {
      if (!isHandedIn(d.status)) continue;
      await tx.studentCredential.updateMany({
        where: { studentId: student.id, credentialRequirementId: d.credentialRequirementId, status: { not: 'verified' } },
        data: {
          status: d.status,
          filePath: d.fileKey,
          // The file's own name, type and size come with it.
          fileName: d.fileKey ? d.fileName : null,
          fileType: d.fileKey ? d.fileType : null,
          fileSize: d.fileKey ? d.fileSize : null,
          submittedBy: d.submittedBy,
          submittedAt: d.submittedAt,
          verifiedBy: d.status === 'verified' ? d.verifiedBy : null,
          verifiedAt: d.status === 'verified' ? d.verifiedAt : null,
          remarks: d.remarks,
          rejectionReason: null,
          updatedAt: new Date(),
        },
      });
    }

    // A pending enrollment for the chosen term — unless the student already has one.
    let enrollment: ApproveResult['enrollment'] = null;
    if (term) {
      const existing = await tx.enrollment.findFirst({ where: { studentId: student.id, schoolYear: term.label, semester: term.semester }, select: { id: true } });
      if (existing) {
        enrollment = { id: existing.id.toString(), term: `SY ${term.label}`, created: false };
      } else {
        const opened = await openPendingEnrollment(tx, { studentId: student.id, curriculumId: student.curriculumId, yearLevel: student.yearLevel, term });
        enrollment = { id: opened.id, term: opened.term, created: true };
      }
    }

    await tx.application.update({ where: { id }, data: { studentId: student.id } });
    return { studentId: student.id.toString(), studentNumber: student.studentNumber, linked, enrollment };
  });
  let result: ApproveResult | undefined;
  for (let n = 0; n < 5 && !result; n += 1) {
    try {
      result = await attempt();
    } catch (error) {
      if (isUniqueViolation(error, 'student_number') && n < 4) continue;
      throw error;
    }
  }
  if (!result) throw new AppError('Could not allocate a student number. Please try again.', 409);

  await recordAudit({
    action: 'application.approved',
    actor: actorLabel(user),
    target: `Application ${before.applicationNumber}`,
    details: { studentNumber: result.studentNumber, linkedExisting: result.linked, enrollmentOpened: result.enrollment?.created ?? false },
    context,
  });
  return result;
}

// --- Documents ---------------------------------------------------------------------------

async function documentTarget(applicationId: bigint, requirementId: bigint) {
  const a = await loadApplication(applicationId);
  if (!isEditable(a.status)) throw new AppError(`Documents on a ${a.status} application can no longer be changed.`, 409, undefined, 'APPLICATION_LOCKED');
  const requirement = await prisma.credentialRequirement.findFirst({
    where: { id: requirementId, isActive: true, OR: [{ programId: null }, { programId: a.programId }] },
    select: { id: true, name: true },
  });
  if (!requirement) throw new NotFoundError('That requirement does not apply to this application.');
  const current = await prisma.applicationDocument.findUnique({ where: { applicationId_credentialRequirementId: { applicationId, credentialRequirementId: requirementId } } });
  return { a, requirement, current };
}

/** Upload (or replace) a requirement's file. It becomes Submitted — never Verified. */
export async function uploadApplicationDocument(user: AuthUser, applicationId: bigint, requirementId: bigint, file: File, context?: AuditContext) {
  const { a, requirement, current } = await documentTarget(applicationId, requirementId);
  if (current?.status === 'verified') {
    throw new AppError(`${requirement.name} is already verified. Set it back to Pending before replacing it.`, 409, { file: ['Already verified.'] }, 'DOCUMENT_LOCKED');
  }
  const upload = await checkUpload(file);
  const key = await storeUpload(`applications/${applicationId}`, upload);
  const now = new Date();
  const data = {
    status: 'submitted', fileKey: key, fileName: upload.name, fileType: upload.type, fileSize: upload.size,
    remarks: null, submittedBy: BigInt(user.id), submittedAt: now, verifiedBy: null, verifiedAt: null,
  };
  const saved = await prisma.applicationDocument.upsert({
    where: { applicationId_credentialRequirementId: { applicationId, credentialRequirementId: requirementId } },
    create: { applicationId, credentialRequirementId: requirementId, ...data },
    update: data,
  });
  if (current?.fileKey && current.fileKey !== key) await deleteStored(current.fileKey);
  await recordAudit({ action: 'application.document_uploaded', actor: actorLabel(user), target: `Application ${a.applicationNumber}`, details: { requirement: requirement.name, file: upload.name }, context });
  return { documentId: saved.id.toString(), status: saved.status, file: { name: upload.name, type: upload.type, size: upload.size } };
}

/**
 * Set a document's status by hand:
 *   submitted — the paper copy was received (or a rejected file is back under review)
 *   verified  — a reviewer checked it; only something handed in can be verified
 *   rejected  — with a reason; the applicant must hand in a new one
 *   pending   — start over: the stored file is removed
 */
export async function setApplicationDocumentStatus(
  user: AuthUser,
  applicationId: bigint,
  requirementId: bigint,
  input: z.infer<typeof applicationDocumentStatusSchema>,
  context?: AuditContext,
) {
  const { a, requirement, current } = await documentTarget(applicationId, requirementId);
  const handedIn = Boolean(current && (current.fileKey || current.status !== 'pending'));
  if ((input.status === 'verified' || input.status === 'rejected') && !handedIn) {
    throw new AppError(`Nothing has been handed in for ${requirement.name} yet — upload it or mark the paper copy as received first.`, 422, { status: ['Nothing to review yet.'] });
  }
  const now = new Date();
  const actor = BigInt(user.id);
  const data: Prisma.ApplicationDocumentUncheckedUpdateInput = { status: input.status, remarks: input.remarks ?? null };
  if (input.status === 'verified' || input.status === 'rejected') Object.assign(data, { verifiedBy: actor, verifiedAt: now });
  if (input.status === 'submitted') Object.assign(data, { verifiedBy: null, verifiedAt: null, ...(current?.status === 'pending' || !current ? { submittedBy: actor, submittedAt: now } : {}) });
  if (input.status === 'pending') Object.assign(data, { fileKey: null, fileName: null, fileType: null, fileSize: null, submittedBy: null, submittedAt: null, verifiedBy: null, verifiedAt: null });

  const saved = await prisma.applicationDocument.upsert({
    where: { applicationId_credentialRequirementId: { applicationId, credentialRequirementId: requirementId } },
    create: { ...(data as Omit<Prisma.ApplicationDocumentUncheckedCreateInput, 'applicationId' | 'credentialRequirementId'>), applicationId, credentialRequirementId: requirementId },
    update: data,
  });
  if (input.status === 'pending' && current?.fileKey) await deleteStored(current.fileKey);
  await recordAudit({
    action: `application.document_${input.status}`,
    actor: actorLabel(user),
    target: `Application ${a.applicationNumber}`,
    details: { requirement: requirement.name, ...(input.remarks ? { remarks: input.remarks } : {}) },
    context,
  });
  return { documentId: saved.id.toString(), status: saved.status };
}

/** The stored file, for the authorized download route. */
export async function applicationDocumentFile(documentId: bigint) {
  const d = await prisma.applicationDocument.findUnique({ where: { id: documentId }, select: { fileKey: true, fileName: true, fileType: true } });
  if (!d?.fileKey) throw new NotFoundError('This document has no file.');
  const stored = await readStored(d.fileKey);
  if (!stored) throw new NotFoundError('The file could not be found in storage.');
  return { ...stored, name: d.fileName ?? 'document', type: d.fileType ?? 'application/octet-stream' };
}
