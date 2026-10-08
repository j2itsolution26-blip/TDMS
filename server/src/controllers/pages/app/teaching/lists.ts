import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, instructorClasses } from '@/server/services/teaching/access';
import { listInstructorAssessments } from '@/server/services/teaching/assessments';
import { instructorDocuments } from '@/server/services/teaching/documents';
import { yearPage } from '@/server/services/teaching/page-context';
import type { AssessmentKind, DocumentKind } from '@shared/lib/teaching';
import type { PageRequest } from '@/server/controllers/pages/types';

/**
 * The shared loaders behind Quizzes, Examinations, Online Activities and
 * Performance Tasks (one per assessment kind), and behind Lesson Plans, TOS
 * and PT documents (one per document kind).
 */

function classOptions(classes: Awaited<ReturnType<typeof instructorClasses>>) {
  return classes.map((c) => ({ id: c.id.toString(), label: `${c.subject.title} — ${classHeading(c).detail}` }));
}

export function assessmentListLoader(kind: AssessmentKind) {
  return async function loadAssessmentList({ query }: PageRequest) {
    const ctx = await yearPage(teachingPolicy.teach, query.year);
    const [classes, rows] = await Promise.all([
      instructorClasses(ctx.user, ctx.yearId),
      listInstructorAssessments(ctx.user, ctx.yearId, [kind]),
    ]);
    return {
      years: ctx.years,
      current: ctx.current ? { id: ctx.current.id.toString(), label: ctx.current.label } : null,
      archived: ctx.archived,
      rows,
      classes: classOptions(classes),
      initialClass: query.class && classes.some((c) => c.id.toString() === query.class) ? query.class : null,
    };
  };
}

export function documentsLoader(kind: DocumentKind) {
  return async function loadDocuments({ query }: PageRequest) {
    const ctx = await yearPage(teachingPolicy.teach, query.year);
    const [classes, rows] = await Promise.all([instructorClasses(ctx.user, ctx.yearId), instructorDocuments(ctx.user, kind, ctx.yearId)]);
    return {
      years: ctx.years,
      current: ctx.current ? { id: ctx.current.id.toString(), label: ctx.current.label } : null,
      archived: ctx.archived,
      rows,
      classes: classOptions(classes),
    };
  };
}

export type AssessmentListData = Awaited<ReturnType<ReturnType<typeof assessmentListLoader>>>;
export type DocumentsData = Awaited<ReturnType<ReturnType<typeof documentsLoader>>>;
