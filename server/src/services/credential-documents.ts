import type { Prisma } from '@prisma/client';

/**
 * The history behind a credential: one student_credential_documents row per
 * soft copy handed in. student_credentials keeps the current state (what the
 * enrollment rules read); these rows keep every earlier file and the verdict
 * each one received, so a replacement never erases what was reviewed before.
 */

type Tx = Prisma.TransactionClient;

export type DocumentReview = 'pending' | 'verified' | 'rejected';

/** The verdict a credential status means for its current document. */
export function reviewOf(status: string): DocumentReview {
  return status === 'verified' ? 'verified' : status === 'rejected' ? 'rejected' : 'pending';
}

/**
 * The version the next document takes: one past the newest on record. A
 * credential whose file predates the history counts from its own version.
 */
export async function nextDocumentVersion(tx: Tx, credential: { id: bigint; version: number; filePath: string | null }): Promise<number> {
  const { _max } = await tx.studentCredentialDocument.aggregate({ where: { studentCredentialId: credential.id }, _max: { version: true } });
  return Math.max((_max.version ?? 0) + 1, credential.filePath ? credential.version + 1 : 1);
}

/** Add a document as the credential's current one; the one it replaces is marked superseded, never removed. */
export async function addCredentialDocument(tx: Tx, data: {
  credentialId: bigint;
  version: number;
  key: string;
  name: string;
  type: string | null;
  size: number | null;
  uploadedBy: bigint | null;
  uploadedAt: Date | null;
  review?: DocumentReview;
  reviewedBy?: bigint | null;
  reviewedAt?: Date | null;
}) {
  const now = new Date();
  const previous = await tx.studentCredentialDocument.findFirst({
    where: { studentCredentialId: data.credentialId, supersededAt: null },
    orderBy: { version: 'desc' },
    select: { id: true },
  });
  if (previous) await tx.studentCredentialDocument.updateMany({ where: { studentCredentialId: data.credentialId, supersededAt: null }, data: { supersededAt: now } });
  return tx.studentCredentialDocument.create({
    data: {
      studentCredentialId: data.credentialId,
      version: data.version,
      filePath: data.key,
      fileName: data.name,
      fileType: data.type,
      fileSize: data.size,
      uploadedBy: data.uploadedBy,
      uploadedAt: data.uploadedAt,
      reviewStatus: data.review ?? 'pending',
      reviewedBy: data.review && data.review !== 'pending' ? data.reviewedBy ?? null : null,
      reviewedAt: data.review && data.review !== 'pending' ? data.reviewedAt ?? null : null,
      previousDocumentId: previous?.id ?? null,
      createdAt: now,
    },
  });
}

/** Record a verdict on the credential's current document (the one holding its file), if there is one. */
export async function reviewCurrentDocument(tx: Tx, credentialId: bigint, filePath: string | null, verdict: {
  review: DocumentReview;
  reviewedBy: bigint;
  reviewedAt: Date;
  rejectionReason: string | null;
}) {
  if (!filePath) return;
  await tx.studentCredentialDocument.updateMany({
    where: { studentCredentialId: credentialId, filePath, supersededAt: null },
    data: { reviewStatus: verdict.review, reviewedBy: verdict.reviewedBy, reviewedAt: verdict.reviewedAt, rejectionReason: verdict.rejectionReason },
  });
}
