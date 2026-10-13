import { prisma } from '@/server/lib/prisma';
import { AppError } from '@/server/lib/http';
import {
  ASSESSMENT_KINDS,
  ASSESSMENT_KIND_LABELS,
  GRADE_REMARK_LABELS,
  SEMESTER_LABELS,
  computeFinalGrade,
  gradeRemark,
  readWeights,
  round2,
  yearLevelLabel,
  type AssessmentKind,
  type GradeRemark,
  type GradeWeights,
} from '@shared/lib/teaching';
import type { AuthUser } from '@shared/types/domain';
import { STUDENT_STATUS_LABELS, type StudentStatus } from '@shared/types/domain';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import { classHeading, classRoster, requireInstructorClass, studentName } from './access';
import { attendanceTotals } from './attendance';
import { notifyStudents } from './notifications';

/**
 * The gradebook and class record.
 *
 * The final grade is computed, not typed: each category's earned points over
 * its possible points, weighted by the class's weights (quizzes, exams,
 * activities, PT), with empty categories left out. Finalizing stores that
 * grade per student in class_grades; releasing makes it visible to students.
 *
 *   grades   DRAFT ──finalize──▶ FINALIZED ──release──▶ RELEASED
 *                  ◀──reopen───
 *
 * Finalizing requires every assessment's results to be finalized first, so a
 * released grade never rests on a score that can still change.
 */

export async function gradebook(user: AuthUser, classId: bigint) {
  const cls = await requireInstructorClass(user, classId);
  const [roster, assessments, scores, grades, attendance] = await Promise.all([
    classRoster(cls.sectionId),
    prisma.assessment.findMany({
      where: { classId },
      orderBy: [{ kind: 'asc' }, { opensAt: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, kind: true, title: true, totalPoints: true, scoreStatus: true, opensAt: true },
    }),
    prisma.assessmentScore.findMany({
      where: { assessment: { classId }, points: { not: null } },
      select: { assessmentId: true, studentId: true, points: true },
    }),
    prisma.classGrade.findMany({ where: { classId } }),
    attendanceTotals(classId),
  ]);

  const weights = readWeights(cls.weights);
  const passing = cls.passingGrade.toNumber();
  const scoreMap = new Map(scores.map((s) => [`${s.assessmentId}:${s.studentId}`, s.points!.toNumber()]));
  const gradeMap = new Map(grades.map((g) => [g.studentId.toString(), g]));

  // Number assessments per kind for column headers: Quiz 1, Quiz 2, …
  const counters: Partial<Record<AssessmentKind, number>> = {};
  const columns = assessments.map((a) => {
    const kind = a.kind as AssessmentKind;
    counters[kind] = (counters[kind] ?? 0) + 1;
    return {
      id: a.id.toString(),
      kind,
      short: `${kind === 'ACTIVITY' ? 'Activity' : kind === 'EXAM' ? 'Exam' : kind === 'PT' ? 'PT' : 'Quiz'} ${counters[kind]}`,
      title: a.title,
      totalPoints: a.totalPoints.toNumber(),
      scoreStatus: a.scoreStatus,
    };
  });

  const rows = roster.map((s) => {
    const cells = columns.map((c) => scoreMap.get(`${c.id}:${s.id}`) ?? null);
    const categories: Partial<Record<AssessmentKind, { earned: number; possible: number }>> = {};
    columns.forEach((c, i) => {
      const points = cells[i];
      // An unscored assessment does not count against the student yet.
      if (points === null || points === undefined) return;
      const cat = (categories[c.kind] ??= { earned: 0, possible: 0 });
      cat.earned += points;
      cat.possible += c.totalPoints;
    });
    const computed = computeFinalGrade(weights, categories);
    const stored = gradeMap.get(s.id.toString());
    const finalGrade = cls.gradeStatus === 'DRAFT' ? computed : stored?.percent?.toNumber() ?? computed;
    const remark = cls.gradeStatus === 'DRAFT' ? gradeRemark(computed, passing) : ((stored?.remarks as GradeRemark | null) ?? gradeRemark(finalGrade, passing));
    const t = attendance.byStudent.get(s.id.toString()) ?? { present: 0, late: 0, absent: 0, excused: 0 };
    return {
      studentId: s.id.toString(),
      studentNumber: s.studentNumber,
      name: studentName(s),
      program: s.program.code,
      yearLevel: yearLevelLabel(s.yearLevel),
      status: s.status,
      statusLabel: STUDENT_STATUS_LABELS[s.status as StudentStatus] ?? s.status,
      cells,
      categories: Object.fromEntries(
        ASSESSMENT_KINDS.map((k) => [k, categories[k] ? round2((categories[k]!.earned / categories[k]!.possible) * 100) : null]),
      ) as Record<AssessmentKind, number | null>,
      finalGrade,
      remark,
      remarkLabel: GRADE_REMARK_LABELS[remark],
      note: stored?.note ?? '',
      attendance: {
        ...t,
        rate: attendance.sessions > 0 ? Math.round(((t.present + t.late + t.excused) / attendance.sessions) * 100) : null,
      },
    };
  });

  return {
    cls: {
      id: cls.id.toString(),
      ...classHeading(cls),
      section: cls.section.name,
      schoolYear: cls.schoolYear.label,
      semester: SEMESTER_LABELS[cls.semester] ?? `Semester ${cls.semester}`,
      archived: cls.schoolYear.status === 'ARCHIVED',
      gradeStatus: cls.gradeStatus,
      passingGrade: passing,
      weights,
    },
    columns,
    rows,
    sessions: attendance.sessions,
  };
}

export async function saveWeights(user: AuthUser, classId: bigint, weights: GradeWeights, context?: AuditContext) {
  const cls = await requireInstructorClass(user, classId, { write: true });
  if (cls.gradeStatus !== 'DRAFT') throw new AppError('Grades are finalized. Reopen them to change the weights.', 409);
  await prisma.classOffering.update({ where: { id: classId }, data: { weights } });
  await recordAudit({ action: 'GRADEBOOK_WEIGHTS_CHANGED', actor: actorLabel(user), target: `${cls.subject.title} — ${classHeading(cls).detail}`, details: { ...weights }, context });
}

export async function saveGradeNotes(user: AuthUser, classId: bigint, notes: { studentId: bigint; note: string | null }[], context?: AuditContext) {
  const cls = await requireInstructorClass(user, classId, { write: true });
  const roster = new Set((await prisma.sectionStudent.findMany({ where: { sectionId: cls.sectionId }, select: { studentId: true } })).map((r) => r.studentId.toString()));
  if (notes.some((n) => !roster.has(n.studentId.toString()))) throw new AppError('One or more students are not in this class.', 422);
  await prisma.$transaction(
    notes.map((n) =>
      prisma.classGrade.upsert({
        where: { classId_studentId: { classId, studentId: n.studentId } },
        create: { classId, studentId: n.studentId, note: n.note, updatedBy: BigInt(user.id) },
        update: { note: n.note, updatedBy: BigInt(user.id) },
      }),
    ),
  );
  await recordAudit({ action: 'GRADEBOOK_REMARKS_SAVED', actor: actorLabel(user), target: `${cls.subject.title} — ${classHeading(cls).detail}`, details: { entries: notes.length }, context });
}

export async function changeGradeStatus(user: AuthUser, classId: bigint, action: 'finalize' | 'release' | 'reopen', context?: AuditContext) {
  const cls = await requireInstructorClass(user, classId, { write: true });
  const target = `${cls.subject.title} — ${classHeading(cls).detail}`;

  if (action === 'finalize') {
    if (cls.gradeStatus !== 'DRAFT') throw new AppError('Grades are already finalized.', 409);
    const draft = await prisma.assessment.count({ where: { classId, scoreStatus: 'DRAFT' } });
    if (draft > 0) {
      throw new AppError(`Finalize the results of every assessment first (${draft} still in draft).`, 409, undefined, 'ASSESSMENTS_IN_DRAFT');
    }
    const book = await gradebook(user, classId);
    await prisma.$transaction(async (tx) => {
      for (const r of book.rows) {
        const studentId = BigInt(r.studentId);
        await tx.classGrade.upsert({
          where: { classId_studentId: { classId, studentId } },
          create: { classId, studentId, percent: r.finalGrade, remarks: r.remark, updatedBy: BigInt(user.id) },
          update: { percent: r.finalGrade, remarks: r.remark, updatedBy: BigInt(user.id) },
        });
      }
      await tx.classOffering.update({ where: { id: classId }, data: { gradeStatus: 'FINALIZED', gradesFinalizedAt: new Date() } });
    });
    await recordAudit({ action: 'GRADEBOOK_FINALIZED', actor: actorLabel(user), target, details: { students: book.rows.length }, context });
    return;
  }

  if (action === 'release') {
    if (cls.gradeStatus !== 'FINALIZED') throw new AppError('Finalize the grades before releasing them.', 409);
    await prisma.$transaction(async (tx) => {
      await tx.classOffering.update({ where: { id: classId }, data: { gradeStatus: 'RELEASED', gradesReleasedAt: new Date() } });
      const graded = await tx.classGrade.findMany({ where: { classId }, select: { studentId: true } });
      await notifyStudents(tx, graded.map((g) => g.studentId), {
        type: 'grades.released',
        title: `Grade released: ${cls.subject.title}`,
        body: `Your final grade for ${cls.subject.title} (${cls.schoolYear.label}) is now available.`,
        href: '/my/grades',
      });
    });
    await recordAudit({ action: 'GRADEBOOK_RELEASED', actor: actorLabel(user), target, context });
    return;
  }

  if (cls.gradeStatus !== 'FINALIZED') throw new AppError('Only finalized grades that have not been released can be reopened.', 409);
  await prisma.classOffering.update({ where: { id: classId }, data: { gradeStatus: 'DRAFT', gradesFinalizedAt: null } });
  await recordAudit({ action: 'GRADEBOOK_REOPENED', actor: actorLabel(user), target, context });
}

/** The gradebook as CSV, with a UTF-8 BOM so Excel reads names correctly. */
export async function gradebookCsv(user: AuthUser, classId: bigint, context?: AuditContext): Promise<{ filename: string; body: string }> {
  const book = await gradebook(user, classId);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Leading = + - @ would be run as a formula by a spreadsheet.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = [
    'Student ID', 'Student Name', 'Program', 'Year Level', 'Status',
    ...book.columns.map((c) => `${c.short} (${c.totalPoints})`),
    ...ASSESSMENT_KINDS.map((k) => `${ASSESSMENT_KIND_LABELS[k]} %`),
    'Attendance %', 'Final Grade', 'Remarks', 'Notes',
  ];
  const lines = [
    [`${book.cls.subject} — ${book.cls.detail}`, `School Year ${book.cls.schoolYear}`, book.cls.semester, `Grades: ${book.cls.gradeStatus}`].map(esc).join(','),
    header.map(esc).join(','),
    ...book.rows.map((r) =>
      [
        r.studentNumber, r.name, r.program, r.yearLevel, r.statusLabel,
        ...r.cells,
        ...ASSESSMENT_KINDS.map((k) => r.categories[k]),
        r.attendance.rate, r.finalGrade, r.remarkLabel, r.note,
      ].map(esc).join(','),
    ),
  ];
  await recordAudit({ action: 'GRADEBOOK_EXPORTED', actor: actorLabel(user), target: `${book.cls.subject} — ${book.cls.detail}`, context });
  const slug = `${book.cls.subjectCode}-${book.cls.detail}`.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { filename: `gradebook-${slug}-${book.cls.schoolYear}.csv`, body: `﻿${lines.join('\r\n')}\r\n` };
}

/** A student's own released grades, across every school year. */
export async function studentGrades(studentId: bigint) {
  const rows = await prisma.classGrade.findMany({
    where: { studentId, class: { gradeStatus: 'RELEASED' } },
    include: { class: { select: { semester: true, passingGrade: true, subject: { select: { code: true, title: true } }, schoolYear: { select: { label: true } }, instructor: { select: { name: true } } } } },
    orderBy: [{ class: { schoolYear: { label: 'desc' } } }, { class: { semester: 'asc' } }],
  });
  return rows.map((g) => ({
    id: g.id.toString(),
    subject: g.class.subject.title,
    code: g.class.subject.code,
    schoolYear: g.class.schoolYear.label,
    semester: SEMESTER_LABELS[g.class.semester] ?? `Semester ${g.class.semester}`,
    instructor: g.class.instructor?.name ?? null,
    percent: g.percent?.toNumber() ?? null,
    remark: (g.remarks as GradeRemark | null) ?? 'INCOMPLETE',
    remarkLabel: GRADE_REMARK_LABELS[(g.remarks as GradeRemark | null) ?? 'INCOMPLETE'],
  }));
}
