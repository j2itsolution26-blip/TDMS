import 'server-only';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AppError, AuthorizationError, NotFoundError } from '@/lib/http';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  SEMESTER_LABELS,
  documentEditable,
  type DocumentKind,
  type DocumentStatus,
} from '@/lib/teaching';
import { dateColumnKey, dateColumnValue } from '@/lib/institution-time';
import type { AuthUser } from '@/types/domain';
import { teachingPolicy } from '@/server/auth/policies';
import { actorLabel, recordAudit, type AuditContext } from '@/server/services/audit-log';
import { checkUpload, deleteStored, readStored, storeUpload, type CheckedUpload } from '@/server/storage';
import type { documentFieldsSchema } from '@/server/validation/teaching';
import { CLASS_INCLUDE, classHeading, requireInstructor, requireInstructorClass } from './access';
import { notifyRoles, notifyUsers } from './notifications';
import { assertWritableYear } from './school-years';

/**
 * Lesson plans, Tables of Specifications and Performance Task documentation.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──start──▶ UNDER_REVIEW ──▶ APPROVED
 *     ▲                    │                    │
 *     └──── (edit) ◀── RETURNED ◀───────────────┘
 *
 * The Instructor owns DRAFT and RETURNED; the Director and Coordinator own
 * the review. A document belongs to one of the Instructor's classes, which
 * is how its subject, program, year level, section and school year are known
 * without being typed twice.
 */

const DOC_INCLUDE = {
  class: { include: CLASS_INCLUDE },
} satisfies Prisma.AcademicDocumentInclude;

type DocRow = Prisma.AcademicDocumentGetPayload<{ include: typeof DOC_INCLUDE }>;

function view(d: DocRow, names: Map<string, string>) {
  const h = classHeading(d.class);
  return {
    id: d.id.toString(),
    kind: d.kind as DocumentKind,
    kindLabel: DOCUMENT_KIND_LABELS[d.kind as DocumentKind],
    title: d.title,
    classId: d.classId.toString(),
    subject: h.subject,
    classDetail: h.detail,
    program: h.program,
    schoolYear: d.class.schoolYear.label,
    semester: SEMESTER_LABELS[d.class.semester] ?? `Semester ${d.class.semester}`,
    documentDate: d.documentDate ? dateColumnKey(d.documentDate) : null,
    details: (d.details ?? {}) as Record<string, string>,
    file: d.fileName ? { name: d.fileName, size: d.fileSize ?? 0, type: d.fileType ?? '' } : null,
    status: d.status as DocumentStatus,
    statusLabel: DOCUMENT_STATUS_LABELS[d.status as DocumentStatus],
    reviewNote: d.reviewNote,
    reviewedBy: d.reviewedBy ? names.get(d.reviewedBy.toString()) ?? null : null,
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    submittedAt: d.submittedAt?.toISOString() ?? null,
    instructor: d.createdBy ? names.get(d.createdBy.toString()) ?? null : null,
    updatedAt: d.updatedAt.toISOString(),
    archived: d.class.schoolYear.status === 'ARCHIVED',
  };
}

export type DocumentView = ReturnType<typeof view>;

/** Names for the actor columns, in one query. */
async function namesFor(rows: DocRow[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.createdBy, r.reviewedBy]).filter((x): x is bigint => x !== null).map(String))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids.map(BigInt) } }, select: { id: true, name: true } }) : [];
  return new Map(users.map((u) => [u.id.toString(), u.name]));
}

// --- Instructor ----------------------------------------------------------------------

export async function instructorDocuments(user: AuthUser, kind: DocumentKind, schoolYearId: bigint | null) {
  requireInstructor(user);
  if (!schoolYearId) return [];
  const rows = await prisma.academicDocument.findMany({
    where: { kind, class: { instructorId: BigInt(user.id), schoolYearId } },
    include: DOC_INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  const names = await namesFor(rows);
  return rows.map((r) => view(r, names));
}

async function requireOwnDocument(user: AuthUser, id: bigint, options: { write?: boolean } = {}) {
  requireInstructor(user);
  const doc = await prisma.academicDocument.findUnique({ where: { id }, select: { classId: true } });
  if (!doc) throw new NotFoundError('Document not found.');
  await requireInstructorClass(user, doc.classId, options);
  return prisma.academicDocument.findUniqueOrThrow({ where: { id }, include: DOC_INCLUDE });
}

export async function createDocument(user: AuthUser, fields: z.output<typeof documentFieldsSchema>, file: File | null, context?: AuditContext) {
  const cls = await requireInstructorClass(user, fields.classId, { write: true });
  const upload = file ? await checkUpload(file) : null;
  const key = upload ? await storeUpload(`documents/${fields.kind.toLowerCase()}`, upload) : null;

  const doc = await prisma.academicDocument.create({
    data: {
      kind: fields.kind,
      classId: cls.id,
      title: fields.title,
      documentDate: fields.documentDate ? dateColumnValue(fields.documentDate) : null,
      details: fields.details,
      ...(upload && key ? fileColumns(upload, key) : {}),
      createdBy: BigInt(user.id),
    },
  });
  await recordAudit({
    action: 'DOCUMENT_CREATED',
    actor: actorLabel(user),
    target: `${DOCUMENT_KIND_LABELS[fields.kind]} "${doc.title}" — ${cls.subject.title}`,
    context,
  });
  return doc;
}

function fileColumns(upload: CheckedUpload, key: string) {
  return { fileKey: key, fileName: upload.name, fileType: upload.type, fileSize: upload.size };
}

export async function updateDocument(user: AuthUser, id: bigint, fields: z.output<typeof documentFieldsSchema>, file: File | null, context?: AuditContext) {
  const doc = await requireOwnDocument(user, id, { write: true });
  if (!documentEditable(doc.status)) throw new AppError('This document is with the reviewers and cannot be edited.', 409);
  if (fields.kind !== doc.kind) throw new AppError('A document cannot change its type.', 422);
  // Moving it to another class is allowed only among the Instructor's own, writable classes.
  if (fields.classId !== doc.classId) await requireInstructorClass(user, fields.classId, { write: true });

  const upload = file ? await checkUpload(file) : null;
  const key = upload ? await storeUpload(`documents/${doc.kind.toLowerCase()}`, upload) : null;
  const updated = await prisma.academicDocument.update({
    where: { id },
    data: {
      classId: fields.classId,
      title: fields.title,
      documentDate: fields.documentDate ? dateColumnValue(fields.documentDate) : null,
      details: fields.details,
      ...(upload && key ? fileColumns(upload, key) : {}),
    },
  });
  if (key && doc.fileKey) await deleteStored(doc.fileKey);
  await recordAudit({ action: 'DOCUMENT_UPDATED', actor: actorLabel(user), target: `${DOCUMENT_KIND_LABELS[doc.kind as DocumentKind]} "${updated.title}"`, details: { replacedFile: Boolean(key) }, context });
  return updated;
}

export async function deleteDocument(user: AuthUser, id: bigint, context?: AuditContext) {
  const doc = await requireOwnDocument(user, id, { write: true });
  if (doc.status !== 'DRAFT') throw new AppError('Only a draft can be deleted.', 409);
  await prisma.academicDocument.delete({ where: { id } });
  if (doc.fileKey) await deleteStored(doc.fileKey);
  await recordAudit({ action: 'DOCUMENT_DELETED', actor: actorLabel(user), target: `${DOCUMENT_KIND_LABELS[doc.kind as DocumentKind]} "${doc.title}"`, context });
}

export async function submitDocument(user: AuthUser, id: bigint, context?: AuditContext) {
  const doc = await requireOwnDocument(user, id, { write: true });
  if (!documentEditable(doc.status)) throw new AppError('This document has already been submitted.', 409);
  if (!doc.fileKey) throw new AppError('Attach the file before submitting.', 422, { file: ['Attach the file before submitting.'] });
  const label = DOCUMENT_KIND_LABELS[doc.kind as DocumentKind];

  await prisma.$transaction(async (tx) => {
    await tx.academicDocument.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt: new Date(), reviewNote: null } });
    await notifyRoles(tx, ['director', 'coordinator'], {
      type: 'document.submitted',
      title: `${label} submitted: ${doc.title}`,
      body: `${user.name} — ${doc.class.subject.title}, ${classHeading(doc.class).detail}.`,
      href: `/academic-reviews?kind=${doc.kind}`,
    });
  });
  await recordAudit({ action: 'DOCUMENT_SUBMITTED', actor: actorLabel(user), target: `${label} "${doc.title}"`, context });
}

// --- Director and Coordinator ----------------------------------------------------------

export async function reviewQueue(user: AuthUser, filters: { kind?: DocumentKind | null; status?: DocumentStatus | null; schoolYearId: bigint | null }) {
  if (!teachingPolicy.viewAcademicDocuments(user)) throw new AuthorizationError();
  const rows = await prisma.academicDocument.findMany({
    where: {
      // Drafts are the Instructor's own working copies, not submissions.
      status: filters.status ? filters.status : { not: 'DRAFT' },
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.schoolYearId ? { class: { schoolYearId: filters.schoolYearId } } : {}),
    },
    include: DOC_INCLUDE,
    orderBy: [{ submittedAt: 'desc' }],
    take: 200,
  });
  const names = await namesFor(rows);
  return rows.map((r) => view(r, names));
}

export async function reviewDocument(user: AuthUser, id: bigint, action: 'start' | 'approve' | 'return', note: string | null, context?: AuditContext) {
  if (!teachingPolicy.reviewAcademicDocuments(user)) throw new AuthorizationError();
  const doc = await prisma.academicDocument.findUnique({ where: { id }, include: DOC_INCLUDE });
  if (!doc) throw new NotFoundError('Document not found.');
  assertWritableYear(doc.class.schoolYear);
  const label = DOCUMENT_KIND_LABELS[doc.kind as DocumentKind];

  const from = doc.status;
  const allowed: Record<typeof action, string[]> = {
    start: ['SUBMITTED'],
    approve: ['SUBMITTED', 'UNDER_REVIEW'],
    return: ['SUBMITTED', 'UNDER_REVIEW'],
  };
  if (!allowed[action].includes(from)) throw new AppError(`A ${DOCUMENT_STATUS_LABELS[from as DocumentStatus].toLowerCase()} document cannot be ${action === 'start' ? 'put under review' : action === 'approve' ? 'approved' : 'returned'}.`, 409);
  if (action === 'return' && !note) throw new AppError('Say what needs to change.', 422, { note: ['Say what needs to change.'] });

  const to = action === 'start' ? 'UNDER_REVIEW' : action === 'approve' ? 'APPROVED' : 'RETURNED';
  await prisma.$transaction(async (tx) => {
    await tx.academicDocument.update({
      where: { id },
      data: { status: to, reviewNote: note ?? doc.reviewNote, reviewedBy: BigInt(user.id), reviewedAt: new Date() },
    });
    if (doc.createdBy) {
      await notifyUsers(tx, [doc.createdBy], {
        type: `document.${to.toLowerCase()}`,
        title: `${label} ${to === 'UNDER_REVIEW' ? 'under review' : to.toLowerCase()}: ${doc.title}`,
        body: note ? `${user.name}: ${note}` : `Reviewed by ${user.name}.`,
        href: `/teaching/documents/${doc.kind === 'LESSON_PLAN' ? 'lesson-plans' : doc.kind.toLowerCase()}`,
      });
    }
  });
  await recordAudit({ action: action === 'start' ? 'DOCUMENT_REVIEW_STARTED' : action === 'approve' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_RETURNED', actor: actorLabel(user), target: `${label} "${doc.title}"`, details: { from, to, note }, context });
}

// --- Files ---------------------------------------------------------------------------

/** The owner, or a reviewer — and a reviewer never sees someone's draft. */
export async function documentFile(user: AuthUser, id: bigint) {
  const doc = await prisma.academicDocument.findUnique({ where: { id }, include: { class: { select: { instructorId: true } } } });
  if (!doc || !doc.fileKey) throw new NotFoundError('File not found.');
  const isOwner = teachingPolicy.teach(user) && doc.class.instructorId?.toString() === user.id;
  const isReviewer = teachingPolicy.viewAcademicDocuments(user) && doc.status !== 'DRAFT';
  if (!isOwner && !isReviewer) throw new NotFoundError('File not found.');
  const stored = await readStored(doc.fileKey);
  if (!stored) throw new NotFoundError('The file could not be found in storage.');
  return { ...stored, name: doc.fileName ?? 'document', type: doc.fileType ?? 'application/octet-stream' };
}
