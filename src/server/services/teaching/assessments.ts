import 'server-only';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AppError, NotFoundError } from '@/lib/http';
import {
  ASSESSMENT_KIND_LABELS,
  EXAM_TYPE_LABELS,
  SUBMISSION_GRACE_MS,
  assessmentPhase,
  attemptDeadline,
  isAcceptingSubmissions,
  parseAnswerSheet,
  round2,
  scoreAnswers,
  timeToMinutes,
  type AssessmentKind,
  type ExamType,
  type KeyItem,
} from '@/lib/teaching';
import { formatLocalClock, formatLocalDate, localDateTime, localDayKey, localMinutes } from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import type { answerKeySchema, assessmentSchema } from '@/server/validation/teaching';
import { CLASS_INCLUDE, classHeading, classRoster, requireInstructor, requireInstructorClass, requireStudentRecord, studentName } from './access';
import { notifyStudents } from './notifications';
import { assertWritableYear } from './school-years';

/**
 * Quizzes, examinations, online activities and performance tasks.
 *
 * One model, four kinds, one lifecycle for results:
 *
 *   scores   DRAFT ──finalize──▶ FINALIZED ──release──▶ RELEASED
 *                  ◀──reopen───
 *
 * Only RELEASED results reach a student — every student-facing query below
 * filters on it, and the answer key is never sent to a student before then.
 * Scores can be entered or changed only while DRAFT.
 *
 * Checking is "key + fast entry": the Instructor sets the answer key; a
 * student either answers online inside the assessment's window, or the
 * Instructor scans the student's QR (or types their ID) and keys in the paper
 * sheet — either way the score is computed from the key on the server.
 */

type Db = Prisma.TransactionClient;

async function requireOwnAssessment(user: AuthUser, id: bigint, options: { write?: boolean } = {}) {
  requireInstructor(user);
  const a = await prisma.assessment.findUnique({ where: { id } });
  if (!a) throw new NotFoundError('Assessment not found.');
  const cls = await requireInstructorClass(user, a.classId, options);
  return { a, cls };
}

function assertDraft(a: { scoreStatus: string }) {
  if (a.scoreStatus !== 'DRAFT') {
    throw new AppError('Results are finalized. Reopen the assessment to change scores.', 409, undefined, 'SCORES_LOCKED');
  }
}

/** The instant window from a local date and times. */
function windowOf(input: { date?: string | null; startTime?: string | null; endTime?: string | null }) {
  if (!input.date) return { opensAt: null, closesAt: null };
  const opensAt = input.startTime ? localDateTime(input.date, input.startTime) : localDateTime(input.date, '00:00');
  const closesAt = input.endTime ? localDateTime(input.date, input.endTime) : localDateTime(input.date, '23:59');
  return { opensAt, closesAt };
}

function scheduleText(opensAt: Date | null, closesAt: Date | null): string | null {
  if (!opensAt) return null;
  const date = formatLocalDate(opensAt);
  return closesAt ? `${date}, ${formatLocalClock(opensAt)} – ${formatLocalClock(closesAt)}` : `${date}, ${formatLocalClock(opensAt)}`;
}

function assessmentData(input: z.output<typeof assessmentSchema>) {
  const { opensAt, closesAt } = windowOf(input);
  let duration = input.durationMinutes ?? null;
  if (input.startTime && input.endTime) {
    const window = timeToMinutes(input.endTime) - timeToMinutes(input.startTime);
    if (duration && duration > window) {
      throw new AppError('The duration cannot be longer than the time window.', 422, { durationMinutes: ['Longer than the time between start and end.'] });
    }
    duration = duration ?? window;
  }
  return {
    kind: input.kind,
    examType: input.kind === 'EXAM' ? input.examType ?? null : null,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    opensAt,
    closesAt,
    durationMinutes: duration,
    totalItems: input.totalItems,
    totalPoints: input.totalPoints,
    passingScore: input.passingScore ?? null,
    onlineEnabled: input.onlineEnabled,
  };
}

// --- Instructor: lists and detail ------------------------------------------------------

export interface AssessmentListRow {
  id: string;
  kind: AssessmentKind;
  kindLabel: string;
  title: string;
  classId: string;
  subject: string;
  classDetail: string;
  schedule: string | null;
  phase: ReturnType<typeof assessmentPhase>;
  scoreStatus: string;
  totalPoints: number;
  items: number;
  keyItems: number;
  scored: number;
  roster: number;
  onlineEnabled: boolean;
  archived: boolean;
}

export async function listInstructorAssessments(user: AuthUser, schoolYearId: bigint | null, kinds: AssessmentKind[]) {
  requireInstructor(user);
  if (!schoolYearId) return [];
  const rows = await prisma.assessment.findMany({
    where: { kind: { in: kinds }, class: { instructorId: BigInt(user.id), schoolYearId } },
    orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      class: { include: { ...CLASS_INCLUDE, section: { select: { ...CLASS_INCLUDE.section.select, _count: { select: { students: true } } } } } },
      _count: { select: { items: true, scores: { where: { points: { not: null } } } } },
    },
  });
  return rows.map((a): AssessmentListRow => ({
    id: a.id.toString(),
    kind: a.kind as AssessmentKind,
    kindLabel: a.examType ? EXAM_TYPE_LABELS[a.examType as ExamType] : ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind],
    title: a.title,
    classId: a.classId.toString(),
    subject: a.class.subject.title,
    classDetail: classHeading(a.class).detail,
    schedule: scheduleText(a.opensAt, a.closesAt),
    phase: assessmentPhase(a),
    scoreStatus: a.scoreStatus,
    totalPoints: a.totalPoints.toNumber(),
    items: a.totalItems,
    keyItems: a._count.items,
    scored: a._count.scores,
    roster: a.class.section._count.students,
    onlineEnabled: a.onlineEnabled,
    archived: a.class.schoolYear.status === 'ARCHIVED',
  }));
}

export async function assessmentDetail(user: AuthUser, id: bigint) {
  const { a, cls } = await requireOwnAssessment(user, id);
  const [items, scores, roster] = await Promise.all([
    prisma.assessmentItem.findMany({ where: { assessmentId: id }, orderBy: { number: 'asc' } }),
    prisma.assessmentScore.findMany({ where: { assessmentId: id } }),
    classRoster(cls.sectionId),
  ]);
  const byStudent = new Map(scores.map((s) => [s.studentId.toString(), s]));
  const total = a.totalPoints.toNumber();
  const passing = a.passingScore?.toNumber() ?? null;

  return {
    assessment: {
      id: a.id.toString(),
      classId: a.classId.toString(),
      kind: a.kind as AssessmentKind,
      examType: a.examType as ExamType | null,
      title: a.title,
      description: a.description,
      instructions: a.instructions,
      date: a.opensAt ? localDayKey(a.opensAt) : null,
      startTime: a.opensAt ? minutesToClock(localMinutes(a.opensAt)) : null,
      endTime: a.closesAt ? minutesToClock(localMinutes(a.closesAt)) : null,
      schedule: scheduleText(a.opensAt, a.closesAt),
      durationMinutes: a.durationMinutes,
      totalItems: a.totalItems,
      totalPoints: total,
      passingScore: passing,
      published: a.published,
      onlineEnabled: a.onlineEnabled,
      scoreStatus: a.scoreStatus,
      phase: assessmentPhase(a),
    },
    cls: { id: cls.id.toString(), ...classHeading(cls), archived: cls.schoolYear.status === 'ARCHIVED' },
    items: items.map((i) => ({
      number: i.number,
      prompt: i.prompt,
      choices: Array.isArray(i.choices) ? (i.choices as string[]) : null,
      answer: i.answer,
      points: i.points.toNumber(),
    })),
    rows: roster.map((s) => {
      const sc = byStudent.get(s.id.toString());
      const points = sc?.points?.toNumber() ?? null;
      return {
        studentId: s.id.toString(),
        studentNumber: s.studentNumber,
        name: studentName(s),
        points,
        source: sc?.source ?? null,
        submitted: Boolean(sc?.submittedAt),
        inProgress: Boolean(sc && sc.startedAt && !sc.submittedAt),
        percent: points !== null && total > 0 ? round2((points / total) * 100) : null,
        passed: points !== null && passing !== null ? points >= passing : null,
      };
    }),
  };
}

function minutesToClock(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// --- Instructor: create, edit, delete ---------------------------------------------------

export async function createAssessment(user: AuthUser, input: z.output<typeof assessmentSchema>, context?: AuditContext) {
  const cls = await requireInstructorClass(user, input.classId, { write: true });
  const a = await prisma.assessment.create({
    data: { ...assessmentData(input), classId: cls.id, createdBy: BigInt(user.id) },
  });
  await recordAudit({
    action: 'ASSESSMENT_CREATED',
    actor: actorLabel(user),
    target: `${ASSESSMENT_KIND_LABELS[input.kind]} "${a.title}" — ${cls.subject.title}`,
    context,
  });
  return a;
}

export async function updateAssessment(user: AuthUser, id: bigint, input: z.output<typeof assessmentSchema>, context?: AuditContext) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  assertDraft(a);
  if (input.classId !== a.classId) throw new AppError('An assessment cannot be moved to another class.', 422);
  if (input.kind !== a.kind) throw new AppError('An assessment cannot change its kind.', 422);
  const updated = await prisma.assessment.update({ where: { id }, data: assessmentData(input) });
  if (a.published) {
    await notifyStudents(prisma, (await prisma.sectionStudent.findMany({ where: { sectionId: cls.sectionId }, select: { studentId: true } })).map((r) => r.studentId), {
      type: 'assessment.updated',
      title: `${ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind]} updated: ${updated.title}`,
      body: scheduleText(updated.opensAt, updated.closesAt) ?? `${cls.subject.title}`,
      href: `/my/assessments/${id}`,
    });
  }
  await recordAudit({ action: 'ASSESSMENT_UPDATED', actor: actorLabel(user), target: `"${a.title}" — ${cls.subject.title}`, context });
  return updated;
}

export async function deleteAssessment(user: AuthUser, id: bigint, context?: AuditContext) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  const scored = await prisma.assessmentScore.count({ where: { assessmentId: id } });
  if (a.published || scored > 0) throw new AppError('Only an unpublished assessment with no scores can be deleted.', 409);
  await prisma.assessment.delete({ where: { id } });
  await recordAudit({ action: 'ASSESSMENT_DELETED', actor: actorLabel(user), target: `"${a.title}" — ${cls.subject.title}`, context });
}

// --- Answer key --------------------------------------------------------------------------

export async function saveAnswerKey(user: AuthUser, id: bigint, items: z.output<typeof answerKeySchema>['items'], context?: AuditContext) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  assertDraft(a);
  const totalPoints = round2(items.reduce((s, i) => s + i.points, 0));

  const rescored = await prisma.$transaction(async (tx) => {
    await tx.assessmentItem.deleteMany({ where: { assessmentId: id } });
    if (items.length > 0) {
      await tx.assessmentItem.createMany({
        data: items.map((i) => ({
          assessmentId: id,
          number: i.number,
          prompt: i.prompt,
          choices: i.choices ?? undefined,
          answer: i.answer,
          points: i.points,
        })),
      });
    }
    await tx.assessment.update({
      where: { id },
      data: items.length > 0 ? { totalItems: items.length, totalPoints } : {},
    });
    // A corrected key re-scores every sheet already checked against it.
    return rescoreAll(tx, id, items.map((i) => ({ number: i.number, answer: i.answer, points: i.points })));
  });

  await recordAudit({
    action: 'ASSESSMENT_KEY_SAVED',
    actor: actorLabel(user),
    target: `"${a.title}" — ${cls.subject.title}`,
    details: { items: items.length, totalPoints, rescored },
    context,
  });
  return { items: items.length, totalPoints, rescored };
}

async function rescoreAll(tx: Db, assessmentId: bigint, key: KeyItem[]): Promise<number> {
  if (key.length === 0) return 0;
  const withAnswers = await tx.assessmentScore.findMany({
    where: { assessmentId, source: { in: ['SHEET', 'ONLINE'] }, submittedAt: { not: null } },
    select: { id: true, answers: true },
  });
  for (const s of withAnswers) {
    const answers = (s.answers ?? {}) as Record<string, string>;
    await tx.assessmentScore.update({ where: { id: s.id }, data: { points: scoreAnswers(key, answers).points } });
  }
  return withAnswers.length;
}

async function keyOf(assessmentId: bigint): Promise<KeyItem[]> {
  const items = await prisma.assessmentItem.findMany({ where: { assessmentId }, orderBy: { number: 'asc' } });
  return items.map((i) => ({ number: i.number, answer: i.answer, points: i.points.toNumber() }));
}

// --- Scores --------------------------------------------------------------------------------

/** Manual entry: the online-activity score sheet and the gradebook's cells. */
export async function saveScores(
  user: AuthUser,
  id: bigint,
  scores: { studentId: bigint; points: number | null }[],
  context?: AuditContext,
) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  assertDraft(a);
  const total = a.totalPoints.toNumber();
  const over = scores.find((s) => s.points !== null && s.points > total);
  if (over) throw new AppError(`A score cannot be more than ${total} points.`, 422, undefined, 'SCORE_TOO_HIGH');

  const roster = new Set((await prisma.sectionStudent.findMany({ where: { sectionId: cls.sectionId }, select: { studentId: true } })).map((r) => r.studentId.toString()));
  const outside = scores.find((s) => !roster.has(s.studentId.toString()));
  if (outside) throw new AppError('One or more students are not in this class.', 422, undefined, 'NOT_IN_CLASS');

  await prisma.$transaction(async (tx) => {
    for (const s of scores) {
      const key = { assessmentId_studentId: { assessmentId: id, studentId: s.studentId } };
      if (s.points === null) {
        // Clearing a manual entry; an online or checked sheet keeps its answers.
        await tx.assessmentScore.deleteMany({ where: { assessmentId: id, studentId: s.studentId, source: 'MANUAL' } });
        await tx.assessmentScore.updateMany({ where: { assessmentId: id, studentId: s.studentId }, data: { points: null } });
        continue;
      }
      await tx.assessmentScore.upsert({
        where: key,
        create: { assessmentId: id, studentId: s.studentId, points: s.points, source: 'MANUAL', submittedAt: new Date(), enteredBy: BigInt(user.id) },
        update: { points: s.points, enteredBy: BigInt(user.id) },
      });
    }
  });

  await recordAudit({
    action: 'ASSESSMENT_SCORES_SAVED',
    actor: actorLabel(user),
    target: `"${a.title}" — ${cls.subject.title}`,
    details: { entries: scores.length },
    context,
  });
  return { saved: scores.length };
}

/**
 * Check one paper sheet: identify the student from the QR or ID, score the
 * keyed-in answers against the key, store it. A second sheet for the same
 * student is refused unless `replace` — so a sheet scanned twice is never
 * counted twice, and a deliberate re-check says so.
 */
export async function checkSheet(
  user: AuthUser,
  id: bigint,
  input: { code: string; answers: string | Record<string, string>; replace: boolean },
  context?: AuditContext,
) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  assertDraft(a);
  const key = await keyOf(id);
  if (key.length === 0) throw new AppError('Set the answer key before checking sheets.', 409, undefined, 'NO_KEY');

  const code = input.code.trim();
  const student = await prisma.student.findFirst({
    where: { OR: [{ qrToken: code }, { studentNumber: { equals: code, mode: 'insensitive' } }] },
    select: { id: true, firstName: true, lastName: true, studentNumber: true },
  });
  if (!student) throw new AppError('No student matches this QR code or ID.', 404, undefined, 'UNKNOWN_STUDENT');
  const onRoster = await prisma.sectionStudent.findFirst({ where: { sectionId: cls.sectionId, studentId: student.id }, select: { id: true } });
  if (!onRoster) throw new AppError('This student is not enrolled in this class.', 422, undefined, 'NOT_IN_CLASS');

  const answers = typeof input.answers === 'string' ? parseAnswerSheet(input.answers, key.length) : input.answers;
  const result = scoreAnswers(key, answers);

  const existing = await prisma.assessmentScore.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId: student.id } } });
  if (existing?.points != null && !input.replace) {
    throw new AppError(
      `${student.firstName} ${student.lastName} already has a score of ${existing.points.toNumber()} / ${a.totalPoints.toNumber()}. Check again with "Replace" to overwrite it.`,
      409,
      undefined,
      'ALREADY_CHECKED',
    );
  }

  await prisma.assessmentScore.upsert({
    where: { assessmentId_studentId: { assessmentId: id, studentId: student.id } },
    create: { assessmentId: id, studentId: student.id, points: result.points, answers, source: 'SHEET', submittedAt: new Date(), enteredBy: BigInt(user.id) },
    update: { points: result.points, answers, source: 'SHEET', submittedAt: new Date(), enteredBy: BigInt(user.id) },
  });

  await recordAudit({
    action: existing ? 'ASSESSMENT_SHEET_RECHECKED' : 'ASSESSMENT_SHEET_CHECKED',
    actor: actorLabel(user),
    target: `${student.studentNumber} — "${a.title}"`,
    details: { points: result.points, possible: result.possible },
    context,
  });

  const passing = a.passingScore?.toNumber() ?? null;
  return {
    student: { name: `${student.firstName} ${student.lastName}`, studentNumber: student.studentNumber },
    assessment: a.title,
    points: result.points,
    possible: result.possible,
    percent: result.possible > 0 ? round2((result.points / result.possible) * 100) : 0,
    passed: passing === null ? null : result.points >= passing,
    correct: result.correct,
    items: result.items,
    replaced: Boolean(existing?.points != null),
  };
}

// --- Lifecycle ---------------------------------------------------------------------------

export async function changeAssessmentStatus(
  user: AuthUser,
  id: bigint,
  action: 'publish' | 'unpublish' | 'finalize' | 'release' | 'reopen',
  context?: AuditContext,
) {
  const { a, cls } = await requireOwnAssessment(user, id, { write: true });
  const label = ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind];
  const rosterIds = async () =>
    (await prisma.sectionStudent.findMany({ where: { sectionId: cls.sectionId }, select: { studentId: true } })).map((r) => r.studentId);

  switch (action) {
    case 'publish': {
      if (a.published) return a;
      if (a.onlineEnabled && (await prisma.assessmentItem.count({ where: { assessmentId: id } })) === 0) {
        throw new AppError('Set the answer key before publishing an online assessment.', 409, undefined, 'NO_KEY');
      }
      const updated = await prisma.assessment.update({ where: { id }, data: { published: true } });
      await notifyStudents(prisma, await rosterIds(), {
        type: 'assessment.scheduled',
        title: `New ${label.toLowerCase()}: ${a.title}`,
        body: `${cls.subject.title}${scheduleText(a.opensAt, a.closesAt) ? ` — ${scheduleText(a.opensAt, a.closesAt)}` : ''}`,
        href: `/my/assessments/${id}`,
      });
      await audit('ASSESSMENT_PUBLISHED');
      return updated;
    }
    case 'unpublish': {
      if ((await prisma.assessmentScore.count({ where: { assessmentId: id } })) > 0) {
        throw new AppError('Students have already started or been scored, so this cannot be unpublished.', 409);
      }
      const updated = await prisma.assessment.update({ where: { id }, data: { published: false } });
      await audit('ASSESSMENT_UNPUBLISHED');
      return updated;
    }
    case 'finalize': {
      if (a.scoreStatus !== 'DRAFT') throw new AppError('Results are already finalized.', 409);
      // Online attempts still open are handed in with what was saved.
      const key = await keyOf(id);
      await prisma.$transaction(async (tx) => {
        const open = await tx.assessmentScore.findMany({ where: { assessmentId: id, submittedAt: null }, select: { id: true, answers: true } });
        for (const s of open) {
          await tx.assessmentScore.update({
            where: { id: s.id },
            data: { submittedAt: new Date(), points: key.length ? scoreAnswers(key, (s.answers ?? {}) as Record<string, string>).points : null },
          });
        }
        await tx.assessment.update({ where: { id }, data: { scoreStatus: 'FINALIZED' } });
      });
      await audit('ASSESSMENT_FINALIZED');
      return prisma.assessment.findUniqueOrThrow({ where: { id } });
    }
    case 'release': {
      if (a.scoreStatus !== 'FINALIZED') throw new AppError('Finalize the results before releasing them.', 409);
      const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.assessment.update({ where: { id }, data: { scoreStatus: 'RELEASED', releasedAt: new Date() } });
        const scored = await tx.assessmentScore.findMany({ where: { assessmentId: id, points: { not: null } }, select: { studentId: true } });
        await notifyStudents(tx, scored.map((s) => s.studentId), {
          type: 'assessment.released',
          title: `Score released: ${a.title}`,
          body: `Your ${label.toLowerCase()} result for ${cls.subject.title} is now available.`,
          href: `/my/assessments/${id}`,
        });
        return u;
      });
      await audit('ASSESSMENT_RELEASED');
      return updated;
    }
    case 'reopen': {
      if (a.scoreStatus !== 'FINALIZED') throw new AppError('Only finalized results that have not been released can be reopened.', 409);
      const updated = await prisma.assessment.update({ where: { id }, data: { scoreStatus: 'DRAFT' } });
      await audit('ASSESSMENT_REOPENED');
      return updated;
    }
  }

  async function audit(actionName: string) {
    await recordAudit({ action: actionName, actor: actorLabel(user), target: `"${a.title}" — ${cls.subject.title}`, context });
  }
}

// --- Students ----------------------------------------------------------------------------

/** Every published assessment in the student's sections, with their own RELEASED results. */
export async function studentAssessments(user: AuthUser) {
  const student = await requireStudentRecord(user);
  const sections = await prisma.sectionStudent.findMany({ where: { studentId: student.id }, select: { sectionId: true } });
  const rows = await prisma.assessment.findMany({
    where: { published: true, class: { sectionId: { in: sections.map((s) => s.sectionId) } } },
    orderBy: [{ opensAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      class: { select: { subject: { select: { title: true, code: true } }, schoolYear: { select: { label: true } } } },
      scores: { where: { studentId: student.id }, select: { points: true, submittedAt: true, startedAt: true } },
    },
  });
  return rows.map((a) => {
    const mine = a.scores[0];
    const released = a.scoreStatus === 'RELEASED';
    const total = a.totalPoints.toNumber();
    const points = released ? mine?.points?.toNumber() ?? null : null;
    return {
      id: a.id.toString(),
      kind: a.kind as AssessmentKind,
      kindLabel: a.examType ? EXAM_TYPE_LABELS[a.examType as ExamType] : ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind],
      title: a.title,
      subject: a.class.subject.title,
      schoolYear: a.class.schoolYear.label,
      schedule: scheduleText(a.opensAt, a.closesAt),
      phase: assessmentPhase(a),
      canTake: isAcceptingSubmissions(a) && !mine?.submittedAt,
      submitted: Boolean(mine?.submittedAt),
      released,
      points,
      totalPoints: total,
      percent: points !== null && total > 0 ? round2((points / total) * 100) : null,
      passed: points !== null && a.passingScore ? points >= a.passingScore.toNumber() : null,
    };
  });
}

async function requireStudentAssessment(user: AuthUser, id: bigint) {
  const student = await requireStudentRecord(user);
  const a = await prisma.assessment.findFirst({
    where: { id, published: true, class: { section: { students: { some: { studentId: student.id } } } } },
    include: { class: { select: { subject: { select: { title: true } }, schoolYear: { select: { status: true, label: true } } } } },
  });
  if (!a) throw new NotFoundError('Assessment not found.');
  return { student, a };
}

export async function studentAssessmentDetail(user: AuthUser, id: bigint) {
  const { student, a } = await requireStudentAssessment(user, id);
  const mine = await prisma.assessmentScore.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId: student.id } } });
  const released = a.scoreStatus === 'RELEASED';
  const total = a.totalPoints.toNumber();
  const points = released ? mine?.points?.toNumber() ?? null : null;
  const deadline = mine?.startedAt ? attemptDeadline(mine.startedAt, a.durationMinutes, a.closesAt) : null;

  // Items (without keys) only while the student is taking it; keys only after release.
  let items: { number: number; prompt: string | null; choices: string[] | null; correct?: string; given?: string; right?: boolean }[] = [];
  const taking = Boolean(mine?.startedAt && !mine.submittedAt && isAcceptingSubmissions(a));
  if (taking || released) {
    const rows = await prisma.assessmentItem.findMany({ where: { assessmentId: id }, orderBy: { number: 'asc' } });
    const given = (mine?.answers ?? {}) as Record<string, string>;
    const scored = released && mine ? scoreAnswers(rows.map((r) => ({ number: r.number, answer: r.answer, points: r.points.toNumber() })), given) : null;
    items = rows.map((r) => ({
      number: r.number,
      prompt: r.prompt,
      choices: Array.isArray(r.choices) ? (r.choices as string[]) : null,
      ...(released ? { correct: r.answer, given: given[String(r.number)] ?? '', right: scored?.items.find((i) => i.number === r.number)?.correct ?? false } : { given: given[String(r.number)] ?? '' }),
    }));
  }

  return {
    id: a.id.toString(),
    kindLabel: a.examType ? EXAM_TYPE_LABELS[a.examType as ExamType] : ASSESSMENT_KIND_LABELS[a.kind as AssessmentKind],
    title: a.title,
    subject: a.class.subject.title,
    description: a.description,
    instructions: a.instructions,
    schedule: scheduleText(a.opensAt, a.closesAt),
    durationMinutes: a.durationMinutes,
    totalItems: a.totalItems,
    totalPoints: total,
    passingScore: a.passingScore?.toNumber() ?? null,
    phase: assessmentPhase(a),
    onlineEnabled: a.onlineEnabled,
    canStart: isAcceptingSubmissions(a) && !mine,
    taking,
    submitted: Boolean(mine?.submittedAt),
    deadline: deadline?.toISOString() ?? null,
    released,
    points,
    percent: points !== null && total > 0 ? round2((points / total) * 100) : null,
    passed: points !== null && a.passingScore ? points >= a.passingScore.toNumber() : null,
    items,
  };
}

export async function startAttempt(user: AuthUser, id: bigint) {
  const { student, a } = await requireStudentAssessment(user, id);
  assertWritableYear(a.class.schoolYear);
  if (!isAcceptingSubmissions(a)) throw new AppError('This assessment is not open right now.', 409, undefined, 'NOT_OPEN');
  const existing = await prisma.assessmentScore.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId: student.id } } });
  if (existing?.submittedAt) throw new AppError('You have already submitted this assessment.', 409, undefined, 'ALREADY_SUBMITTED');
  if (!existing) {
    await prisma.assessmentScore
      .create({ data: { assessmentId: id, studentId: student.id, source: 'ONLINE', startedAt: new Date(), answers: {} } })
      .catch((e: { code?: string }) => {
        if (e.code !== 'P2002') throw e; // a double-click: the first start stands
      });
  }
  return studentAssessmentDetail(user, id);
}

export async function submitAttempt(user: AuthUser, id: bigint, answers: Record<string, string>, final: boolean) {
  const { student, a } = await requireStudentAssessment(user, id);
  assertWritableYear(a.class.schoolYear);
  const mine = await prisma.assessmentScore.findUnique({ where: { assessmentId_studentId: { assessmentId: id, studentId: student.id } } });
  if (!mine?.startedAt) throw new AppError('Start the assessment first.', 409);
  if (mine.submittedAt) throw new AppError('You have already submitted this assessment.', 409, undefined, 'ALREADY_SUBMITTED');
  if (a.scoreStatus !== 'DRAFT') throw new AppError('This assessment is closed.', 409, undefined, 'NOT_OPEN');

  const deadline = attemptDeadline(mine.startedAt, a.durationMinutes, a.closesAt);
  const late = deadline && Date.now() > deadline.getTime() + SUBMISSION_GRACE_MS;
  // Past the bell, progress can no longer be saved; the last saved answers are handed in.
  const kept = late ? ((mine.answers ?? {}) as Record<string, string>) : answers;
  const hand = final || Boolean(late);

  const key = hand ? await keyOf(id) : [];
  await prisma.assessmentScore.update({
    where: { id: mine.id },
    data: {
      answers: kept,
      ...(hand ? { submittedAt: new Date(), points: key.length ? scoreAnswers(key, kept).points : null } : {}),
    },
  });
  return { submitted: hand, late: Boolean(late) };
}
