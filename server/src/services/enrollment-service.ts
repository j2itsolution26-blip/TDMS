import { Prisma } from '@prisma/client';
import { prisma } from '@/server/lib/prisma';
import { sectionLabel, yearLevelLabel } from '@shared/lib/teaching';
import { validYearLevels } from '@shared/lib/enrollment-term';
import { AppError, NotFoundError } from '@/server/lib/http';
import type { z } from 'zod';
import type { enrollmentSchema } from '@/server/schemas/schemas';
import { ensureCredentialChecklist, hasAllRequiredCredentialsVerified } from './student-service';
import { recordAudit, actorLabel, type AuditContext } from './audit-log';
import { ENROLLMENT_STATUS_LABELS, ENROLLMENT_TRANSITIONS, type AuthUser, type EnrollmentStatus } from '@shared/types/domain';
import { assignSection, isRetryable, releaseSeats, type Placement } from './teaching/section-assignment';
import { checkUpload, deleteStored, readStored, storeUpload } from '@/server/lib/storage';
import { CREDENTIAL_UPLOAD_LABEL, CREDENTIAL_UPLOAD_TYPES, credentialFileLabel } from '@shared/lib/credential-files';

/**
 * Enrolment and credential verification.
 *
 * Port of enrollment/show, App\Models\Enrollment and
 * App\Models\StudentCredential.
 */

// --- Credentials -----------------------------------------------------------

export async function listStudentCredentials(studentId: bigint) {
  await ensureCredentialChecklist(studentId);
  const rows = await prisma.studentCredential.findMany({
    where: { studentId },
    include: { requirement: true, verifier: true, submitter: true },
  });

  // Laravel sorted in PHP by requirement name after fetching.
  rows.sort((a, b) => a.requirement.name.localeCompare(b.requirement.name));

  return rows.map((c) => ({
    id: c.id.toString(),
    status: c.status,
    version: c.version,
    remarks: c.remarks,
    rejectionReason: c.rejectionReason,
    // The storage key stays on the server; the page gets what to show and whether a file exists.
    hasFile: Boolean(c.filePath),
    fileName: credentialFileLabel({ fileName: c.fileName, filePath: c.filePath, requirementName: c.requirement.name, version: c.version }),
    fileType: c.fileType ?? (c.filePath ? CREDENTIAL_UPLOAD_TYPES[c.filePath.split('.').pop()!.toLowerCase()] ?? null : null),
    fileSize: c.fileSize,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    submitter: c.submitter ? { name: c.submitter.name } : null,
    verifiedAt: c.verifiedAt?.toISOString() ?? null,
    requirement: {
      id: c.requirement.id.toString(),
      name: c.requirement.name,
      isRequired: c.requirement.isRequired,
    },
    verifier: c.verifier ? { name: c.verifier.name } : null,
  }));
}

export async function getCredential(id: bigint) {
  const credential = await prisma.studentCredential.findUnique({ where: { id } });
  if (!credential) throw new NotFoundError('Credential not found.');
  return credential;
}

/** Port of StudentCredential::verify() — and only a document that has been uploaded can be verified. */
export async function verifyCredential(id: bigint, actorId: bigint, remarks: string | null) {
  const credential = await getCredential(id);
  if (!credential.filePath) {
    throw new AppError('Upload the document before verifying it: there is no file on record.', 422, { file: ['No document has been uploaded yet.'] }, 'CREDENTIAL_NO_FILE');
  }
  return prisma.studentCredential.update({
    where: { id },
    data: {
      status: 'verified',
      verifiedBy: actorId,
      verifiedAt: new Date(),
      remarks,
      rejectionReason: null,
      updatedAt: new Date(),
    },
  });
}

/** Port of StudentCredential::reject(). */
export async function rejectCredential(id: bigint, actorId: bigint, reason: string) {
  await getCredential(id);
  return prisma.studentCredential.update({
    where: { id },
    data: {
      status: 'rejected',
      verifiedBy: actorId,
      verifiedAt: new Date(),
      rejectionReason: reason,
      updatedAt: new Date(),
    },
  });
}

/**
 * Upload (or replace) the soft copy of one credential.
 *
 *   * the credential names its own student and requirement, so a file can
 *     only ever land on the record it was sent for;
 *   * a verified credential is locked against replacement (isCredentialLocked);
 *   * the file is checked (PDF, JPG or PNG, at most 4 MB, content matching the
 *     extension) and stored under a generated key BEFORE the record changes;
 *     the record is then updated only if nobody changed it meanwhile (the
 *     version it was read at). If that update does not happen, the new file is
 *     removed and the record is exactly as it was;
 *   * the new version is Submitted — awaiting review — never Verified; the
 *     previous verdict is cleared, the version goes up, uploader and time are
 *     recorded;
 *   * the previous file is kept: a first version may be the application's own
 *     file (carried over at approval), and the older versions are history.
 */
export async function uploadCredentialFile(user: AuthUser, id: bigint, file: File, context?: AuditContext) {
  const credential = await prisma.studentCredential.findUnique({
    where: { id },
    include: { requirement: { select: { name: true } }, student: { select: { studentNumber: true } } },
  });
  if (!credential) throw new NotFoundError('Credential not found.');
  if (isCredentialLocked(credential.status)) {
    throw new AppError(`${credential.requirement.name} is verified, so its document cannot be replaced.`, 409, { file: ['This credential is verified.'] }, 'CREDENTIAL_LOCKED');
  }

  const upload = await checkUpload(file, { types: CREDENTIAL_UPLOAD_TYPES, label: CREDENTIAL_UPLOAD_LABEL });
  const key = await storeUpload(`students/${credential.studentId}/credentials`, upload);

  let updated;
  try {
    const done = await prisma.studentCredential.updateMany({
      where: { id, version: credential.version, status: { not: 'verified' } },
      data: {
        filePath: key,
        fileName: upload.name,
        fileType: upload.type,
        fileSize: upload.size,
        submittedBy: BigInt(user.id),
        submittedAt: new Date(),
        status: 'submitted',
        version: credential.version + 1,
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
        updatedAt: new Date(),
      },
    });
    if (done.count !== 1) {
      throw new AppError(`${credential.requirement.name} was changed by someone else just now. Reload and try again.`, 409, undefined, 'CREDENTIAL_CHANGED');
    }
    updated = await prisma.studentCredential.findUniqueOrThrow({ where: { id } });
  } catch (error) {
    // The record did not take the new file: do not leave it behind in storage.
    await deleteStored(key);
    throw error;
  }

  await recordAudit({
    action: 'credential.document_uploaded',
    actor: actorLabel(user),
    target: `Student ${credential.student.studentNumber}`,
    details: { credential_id: id.toString(), requirement: credential.requirement.name, version: updated.version, file: upload.name, size: upload.size, replaced: Boolean(credential.filePath) },
    context,
  });

  return {
    id: updated.id.toString(),
    status: updated.status,
    version: updated.version,
    hasFile: true,
    fileName: upload.name,
    fileType: upload.type,
    fileSize: upload.size,
    submittedAt: updated.submittedAt?.toISOString() ?? null,
  };
}

/** A credential's current file, for the authorized preview/download route. The key never leaves the server. */
export async function credentialFile(id: bigint) {
  const c = await prisma.studentCredential.findUnique({ where: { id }, include: { requirement: { select: { name: true } } } });
  if (!c) throw new NotFoundError('Credential not found.');
  if (!c.filePath) throw new NotFoundError('No document has been uploaded for this credential.');
  const stored = await readStored(c.filePath);
  if (!stored) throw new NotFoundError('The document could not be found in storage.');
  const ext = c.filePath.split('.').pop()!.toLowerCase();
  return {
    name: credentialFileLabel({ fileName: c.fileName, filePath: c.filePath, requirementName: c.requirement.name, version: c.version })!,
    type: c.fileType ?? CREDENTIAL_UPLOAD_TYPES[ext] ?? 'application/octet-stream',
    size: stored.size,
    body: stored.body,
  };
}

/** A verified credential is locked against replacement. */
export function isCredentialLocked(status: string): boolean {
  return status === 'verified';
}

// --- Enrollments -----------------------------------------------------------

export async function listEnrollments(studentId: bigint) {
  const [rows, placements] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId },
      include: { approver: true },
      orderBy: { createdAt: 'desc' },
    }),
    // The student's section in each school year, for the Section column.
    prisma.sectionStudent.findMany({
      where: { studentId },
      select: { schoolYearId: true, section: { select: { name: true, yearLevel: true, program: { select: { code: true } }, schoolYear: { select: { label: true } } } } },
    }),
  ]);
  const sectionFor = (e: (typeof rows)[number]) => {
    const p = placements.find((x) => (e.schoolYearId ? x.schoolYearId === e.schoolYearId : x.section.schoolYear.label === e.schoolYear));
    return p ? sectionLabel(p.section.program.code, p.section.yearLevel, p.section.name) : null;
  };

  return rows.map((e) => ({
    section: sectionFor(e),
    id: e.id.toString(),
    schoolYear: e.schoolYear,
    semester: e.semester,
    yearLevel: e.yearLevel,
    status: e.status,
    approvedAt: e.approvedAt?.toISOString() ?? null,
    approver: e.approver ? { name: e.approver.name } : null,
  }));
}

const ENROLLMENTS_PAGE_SIZE = 15;

/**
 * Every enrollment, newest first — the Enrollments page. Read-only: changing
 * an enrollment still happens on the student's record, where the credential
 * gate lives.
 */
export async function listAllEnrollments(options: { page?: number; status?: string; programId?: bigint; search?: string; schoolYear?: string; yearLevel?: number } = {}) {
  const page = options.page ?? 1;
  const q = options.search?.trim() ?? '';
  // Program and search narrow everything below; the status filter narrows the
  // rows and the program counts, the program filter the status counts — so
  // each tab's count is what that tab would show.
  const bySearch: Prisma.EnrollmentWhereInput = q
    ? { student: { OR: [
        { studentNumber: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ] } }
    : {};
  const byProgram: Prisma.EnrollmentWhereInput = options.programId ? { student: { programId: options.programId } } : {};
  // School year and year level narrow every count, like the search.
  const byTerm: Prisma.EnrollmentWhereInput = {
    ...(options.schoolYear ? { schoolYear: options.schoolYear } : {}),
    ...(options.yearLevel ? { yearLevel: options.yearLevel } : {}),
  };
  const byStatusFilter: Prisma.EnrollmentWhereInput = options.status ? { status: options.status } : {};
  const where: Prisma.EnrollmentWhereInput = { AND: [bySearch, byTerm, byProgram, byStatusFilter] };

  const [rows, total, byStatus] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * ENROLLMENTS_PAGE_SIZE,
      take: ENROLLMENTS_PAGE_SIZE,
      select: {
        id: true,
        schoolYear: true,
        schoolYearId: true,
        semester: true,
        yearLevel: true,
        status: true,
        createdAt: true,
        approvedAt: true,
        approver: { select: { name: true } },
        curriculum: { select: { versionLabel: true } },
        // The latest decision, for who rejected or dropped it, when and why.
        statusHistory: { orderBy: { id: 'desc' }, take: 1, select: { toStatus: true, reason: true, createdAt: true, actor: { select: { name: true } } } },
        student: {
          select: {
            id: true,
            studentNumber: true,
            firstName: true,
            lastName: true,
            programId: true,
            yearLevel: true,
            program: { select: { code: true, name: true } },
          },
        },
      },
    }),
    prisma.enrollment.count({ where }),
    prisma.enrollment.groupBy({ by: ['status'], where: { AND: [bySearch, byTerm, byProgram] }, _count: { _all: true } }),
  ]);
  const programRows = await prisma.$queryRaw<{ program_id: bigint; n: number }[]>`
    SELECT s.program_id, COUNT(*)::int AS n
    FROM enrollments e JOIN students s ON s.id = e.student_id
    WHERE (${options.status ?? null}::text IS NULL OR e.status = ${options.status ?? null})
      AND (${options.schoolYear ?? null}::text IS NULL OR e.school_year = ${options.schoolYear ?? null})
      AND (${options.yearLevel ?? null}::int IS NULL OR e.year_level = ${options.yearLevel ?? null})
      AND (${q}::text = '' OR s.student_number ILIKE ${'%' + q + '%'} OR s.first_name ILIKE ${'%' + q + '%'} OR s.last_name ILIKE ${'%' + q + '%'})
    GROUP BY s.program_id`;

  // Each row's section: the student's placement in that enrollment's school year, in two queries.
  const labels = [...new Set(rows.filter((e) => !e.schoolYearId).map((e) => e.schoolYear))];
  const yearsByLabel = labels.length ? await prisma.schoolYear.findMany({ where: { label: { in: labels } }, select: { id: true, label: true } }) : [];
  const yearOf = (e: (typeof rows)[number]) => e.schoolYearId ?? yearsByLabel.find((y) => y.label === e.schoolYear)?.id ?? null;
  const yearIds = [...new Set(rows.map(yearOf).filter((x): x is bigint => x !== null))];
  const placements = rows.length && yearIds.length
    ? await prisma.sectionStudent.findMany({
        where: { studentId: { in: [...new Set(rows.map((e) => e.student.id))] }, schoolYearId: { in: yearIds } },
        select: { studentId: true, schoolYearId: true, section: { select: { name: true, yearLevel: true, program: { select: { code: true } } } } },
      })
    : [];
  const sectionOf = (e: (typeof rows)[number]) => {
    const y = yearOf(e);
    const p = placements.find((x) => x.studentId === e.student.id && x.schoolYearId === y);
    return p ? sectionLabel(p.section.program.code, p.section.yearLevel, p.section.name) : null;
  };

  // Required documents of the students whose enrollment is still pending, in two queries.
  const pending = rows.filter((e) => e.status === 'pending');
  const programIds = [...new Set(pending.map((e) => e.student.programId))];
  const requirements = pending.length
    ? await prisma.credentialRequirement.findMany({
        where: { isActive: true, isRequired: true, OR: [{ programId: null }, { programId: { in: programIds } }] },
        select: { id: true, name: true, programId: true },
        orderBy: { name: 'asc' },
      })
    : [];
  const verified = pending.length
    ? await prisma.studentCredential.findMany({
        where: { studentId: { in: pending.map((e) => e.student.id) }, status: 'verified', credentialRequirementId: { in: requirements.map((r) => r.id) } },
        select: { studentId: true, credentialRequirementId: true },
      })
    : [];

  const documentsFor = (studentId: bigint, programId: bigint) => {
    const required = requirements.filter((r) => r.programId === null || r.programId === programId);
    const done = new Set(verified.filter((v) => v.studentId === studentId).map((v) => v.credentialRequirementId.toString()));
    // Every required document by name, so the review names the verified ones too.
    const items = required.map((r) => ({ name: r.name, verified: done.has(r.id.toString()) }));
    const missing = items.filter((d) => !d.verified).map((d) => d.name);
    return { required: required.length, verified: required.length - missing.length, missing, items };
  };

  return {
    rows: rows.map((e) => {
      const last = e.statusHistory[0];
      return {
        id: e.id.toString(),
        schoolYear: e.schoolYear,
        semester: e.semester,
        yearLevel: e.yearLevel,
        status: e.status,
        createdAt: e.createdAt?.toISOString() ?? null,
        curriculum: e.curriculum?.versionLabel ?? null,
        approvedAt: e.approvedAt?.toISOString() ?? null,
        approver: e.approver?.name ?? null,
        decision: last && last.toStatus === e.status ? { by: last.actor?.name ?? null, at: last.createdAt.toISOString(), reason: last.reason } : null,
        documents: e.status === 'pending' ? documentsFor(e.student.id, e.student.programId) : null,
        section: sectionOf(e),
        student: {
          id: e.student.id.toString(),
          studentNumber: e.student.studentNumber,
          name: `${e.student.firstName} ${e.student.lastName}`,
          programCode: e.student.program.code,
          programName: e.student.program.name,
        },
      };
    }),
    counts: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])) as Record<string, number>,
    programCounts: Object.fromEntries(programRows.map((r) => [r.program_id.toString(), r.n])) as Record<string, number>,
    page,
    total,
    lastPage: Math.max(1, Math.ceil(total / ENROLLMENTS_PAGE_SIZE)),
  };
}

export async function createEnrollment(input: z.infer<typeof enrollmentSchema>) {
  // The composite unique index is (student_id, school_year, semester).
  const clash = await prisma.enrollment.findFirst({
    where: { studentId: input.studentId, schoolYear: input.schoolYear, semester: input.semester },
    select: { id: true },
  });
  if (clash) {
    throw new AppError('This student already has an enrollment for that term.', 422, {
      schoolYear: ['This student already has an enrollment for that term.'],
    });
  }

  // The curriculum comes from the student record; it must be the student's own program.
  const [owner, curriculum] = await Promise.all([
    prisma.student.findUnique({ where: { id: input.studentId }, select: { programId: true, program: { select: { code: true } } } }),
    prisma.curriculum.findUnique({ where: { id: input.curriculumId }, select: { programId: true } }),
  ]);
  if (!owner || !curriculum || owner.programId !== curriculum.programId) {
    throw new AppError(
      `This curriculum belongs to another program. A student of ${owner?.program.code ?? 'this program'} is enrolled under their own program; a change of program is a transfer.`,
      422, { curriculumId: ['Curriculum of another program.'] },
    );
  }

  // A school year that has been set up: approval places the student in one of
  // its sections, so a term in a year that does not exist could never be
  // approved. An archived year is read-only, so nobody is enrolled into it.
  const year = await prisma.schoolYear.findUnique({ where: { label: input.schoolYear }, select: { id: true, status: true } });
  if (!year) {
    throw new AppError(`School year ${input.schoolYear} has not been set up.`, 422, {
      schoolYear: ['Choose a school year that has been set up under School Years.'],
    });
  }
  if (year.status === 'ARCHIVED') {
    throw new AppError(`School year ${input.schoolYear} is archived.`, 422, {
      schoolYear: ['This school year is archived and cannot take new enrollments.'],
    });
  }

  // No year level beyond the student's curriculum's final year (enrollment-term.ts).
  const [{ final_year: finalYear } = { final_year: null }] = await prisma.$queryRaw<{ final_year: number | null }[]>`
    SELECT max(year_level)::int AS final_year FROM curriculum_subjects WHERE curriculum_id = ${input.curriculumId}`;
  const levels = validYearLevels(finalYear);
  if (!levels.includes(input.yearLevel)) {
    throw new AppError(`This curriculum runs to ${yearLevelLabel(levels[levels.length - 1]!)}.`, 422, {
      yearLevel: [`Choose ${levels.map(yearLevelLabel).join(', ').replace(/, ([^,]*)$/, ' or $1')}.`],
    });
  }

  try {
    return await prisma.enrollment.create({
      data: {
        studentId: input.studentId,
        curriculumId: input.curriculumId,
        schoolYear: input.schoolYear,
        schoolYearId: year.id,
        semester: input.semester,
        yearLevel: input.yearLevel,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    // Two submissions at once: the check above passed for both, the unique
    // index stops the second. It gets the same message the check gives.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('This student already has an enrollment for that term.', 422, {
        schoolYear: ['This student already has an enrollment for that term.'],
      });
    }
    throw error;
  }
}

/**
 * Decide an enrollment: approve it (enrolled), reject it, or drop an enrolled
 * one. Port of Enrollment::transitionTo(), tightened:
 *
 *   * only the moves in ENROLLMENT_TRANSITIONS are allowed, so an approved
 *     enrollment cannot be approved again, and a rejected or dropped one
 *     cannot be revived;
 *   * the update is conditional on the status it was read in, inside the
 *     transaction, so two people deciding at once cannot both win;
 *   * rejecting and dropping need a reason, kept in the status history;
 *   * approving still needs every required document verified, and stamps the
 *     approver and flips the student to `active`, as before;
 *   * approving also places the student in a section of their program, the
 *     enrollment's year level and its school year (teaching/section-assignment)
 *     in the SAME transaction — approved and placed, or neither — and says
 *     which section; a collision with a concurrent change is retried;
 *   * dropping frees the student's seat in that school year's section, unless
 *     another term of the same school year is still enrolled (an archived
 *     year's placement is history and is never touched);
 *   * every decision is written to the audit log.
 */
export async function transitionEnrollment(
  id: bigint,
  toStatus: EnrollmentStatus,
  actor: AuthUser,
  reason: string | null = null,
  context?: AuditContext,
) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    include: { student: { select: { id: true, studentNumber: true, firstName: true, lastName: true, programId: true, program: { select: { code: true } } } } },
  });
  if (!enrollment) throw new NotFoundError('Enrollment not found.');

  const from = enrollment.status as EnrollmentStatus;
  const allowed = ENROLLMENT_TRANSITIONS[from] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new AppError(
      from === toStatus
        ? `This enrollment is already ${ENROLLMENT_STATUS_LABELS[from]?.toLowerCase() ?? from}.`
        : `A ${ENROLLMENT_STATUS_LABELS[from]?.toLowerCase() ?? from} enrollment cannot be ${toStatus === 'enrolled' ? 'approved' : ENROLLMENT_STATUS_LABELS[toStatus]?.toLowerCase() ?? toStatus}.`,
      409,
      undefined,
      'ENROLLMENT_ALREADY_DECIDED',
    );
  }
  if ((toStatus === 'rejected' || toStatus === 'dropped') && !reason?.trim()) {
    throw new AppError('Give a reason.', 422, { reason: ['Give a reason.'] });
  }

  // The school year the student will be placed in: the enrollment's own, as a record.
  let schoolYear: { id: bigint; label: string } | null = null;
  if (toStatus === 'enrolled') {
    const ready = await hasAllRequiredCredentialsVerified(enrollment.studentId);
    if (!ready) {
      throw new AppError('This student still has unverified or missing required credentials.', 422);
    }
    const year = enrollment.schoolYearId
      ? await prisma.schoolYear.findUnique({ where: { id: enrollment.schoolYearId }, select: { id: true, label: true, status: true } })
      : await prisma.schoolYear.findUnique({ where: { label: enrollment.schoolYear }, select: { id: true, label: true, status: true } });
    if (!year) {
      throw new AppError(
        `School year ${enrollment.schoolYear} has not been set up, so the student cannot be placed in a section. Create it under School Years, then approve again.`,
        422, undefined, 'SCHOOL_YEAR_MISSING',
      );
    }
    if (year.status === 'ARCHIVED') {
      throw new AppError(`School year ${year.label} is archived. Its sections are read-only.`, 409, undefined, 'SCHOOL_YEAR_ARCHIVED');
    }
    schoolYear = year;
  }
  // Dropping: the school year whose seat is freed, when it is a record and not archived.
  let dropYear: bigint | null = null;
  if (toStatus === 'dropped') {
    const year = enrollment.schoolYearId
      ? await prisma.schoolYear.findUnique({ where: { id: enrollment.schoolYearId }, select: { id: true, status: true } })
      : await prisma.schoolYear.findUnique({ where: { label: enrollment.schoolYear }, select: { id: true, status: true } });
    if (year && year.status !== 'ARCHIVED') dropYear = year.id;
  }

  const actorId = BigInt(actor.id);
  const current = enrollment;
  const year = schoolYear;

  // Approve (or reject, or drop) and — on approval — place the student, as one transaction.
  const decide = () => prisma.$transaction(async (tx): Promise<{ placement: Placement | null; released: string[] }> => {
    const done = await tx.enrollment.updateMany({
      where: { id, status: from },
      data: {
        status: toStatus,
        approvedBy: toStatus === 'enrolled' ? actorId : current.approvedBy,
        approvedAt: toStatus === 'enrolled' ? new Date() : current.approvedAt,
        updatedAt: new Date(),
      },
    });
    if (done.count !== 1) {
      throw new AppError('This enrollment was just decided by someone else. Reload to see it.', 409, undefined, 'ENROLLMENT_ALREADY_DECIDED');
    }

    await tx.enrollmentStatusHistory.create({
      data: { enrollmentId: id, fromStatus: from, toStatus, changedBy: actorId, reason: reason?.trim() || null },
    });

    if (toStatus === 'dropped' && dropYear !== null) {
      // Another term of the same school year still enrolled keeps the seat.
      const stillEnrolled = await tx.enrollment.count({
        where: { studentId: current.studentId, schoolYear: current.schoolYear, status: 'enrolled', id: { not: id } },
      });
      return { placement: null, released: stillEnrolled > 0 ? [] : await releaseSeats(tx, current.studentId, [dropYear]) };
    }

    if (toStatus !== 'enrolled' || !year) return { placement: null, released: [] };
    await tx.student.update({
      where: { id: current.studentId },
      data: { status: 'active', updatedAt: new Date() },
    });
    const placed = await assignSection(tx, {
      studentId: current.studentId,
      programId: current.student.programId,
      programCode: current.student.program.code,
      yearLevel: current.yearLevel,
      schoolYearId: year.id,
      schoolYearLabel: year.label,
    });
    return { placement: placed, released: [] };
  // Approvals into one group queue on its lock; give a busy moment room.
  }, { maxWait: 10_000, timeout: 20_000 });

  // A unique-index collision (someone created the same section name a moment
  // earlier) rolls the whole decision back; it is tried again, twice at most.
  let placement: Placement | null = null;
  let released: string[] = [];
  for (let attempt = 1; ; attempt += 1) {
    try {
      ({ placement, released } = await decide());
      break;
    } catch (error) {
      if (attempt < 3 && isRetryable(error)) continue;
      throw error;
    }
  }

  const action = toStatus === 'enrolled' ? 'ENROLLMENT_APPROVED' : toStatus === 'rejected' ? 'ENROLLMENT_REJECTED' : 'ENROLLMENT_DROPPED';
  await recordAudit({
    action,
    actor: actorLabel(actor),
    target: `Enrollment: ${enrollment.student.studentNumber} (${enrollment.student.firstName} ${enrollment.student.lastName}), SY ${enrollment.schoolYear} semester ${enrollment.semester}`,
    details: {
      enrollment_id: id.toString(), from, to: toStatus,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(placement ? { section: placement.label, section_created: placement.created, already_placed: placement.already } : {}),
      ...(released.length ? { seat_released: released } : {}),
    },
    context,
  });
  if (placement && !placement.already) {
    await recordAudit({
      action: placement.created ? 'SECTION_CREATED_AND_STUDENT_ASSIGNED' : 'SECTION_STUDENT_ASSIGNED',
      actor: actorLabel(actor),
      target: placement.label,
      details: { studentId: enrollment.studentId.toString(), enrollment_id: id.toString(), automatic: true },
      context,
    });
  }
  for (const label of released) {
    await recordAudit({ action: 'SECTION_STUDENT_REMOVED', actor: actorLabel(actor), target: label, details: { studentId: enrollment.studentId.toString(), reason: 'enrollment dropped', enrollment_id: id.toString() }, context });
  }
  return {
    placement: placement ? { section: placement.label, created: placement.created, already: placement.already } : null,
    released,
  };
}

/**
 * Default school year, as the Volt component's mount() computed it: the
 * academic year rolls over in June.
 */
export function defaultSchoolYear(now = new Date()): string {
  const year = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}
