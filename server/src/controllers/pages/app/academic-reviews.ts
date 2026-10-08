import { teachingPolicy } from '@/server/auth/policies';
import { reviewQueue } from '@/server/services/teaching/documents';
import { yearPage } from '@/server/services/teaching/page-context';
import { DOCUMENT_KINDS, DOCUMENT_STATUSES, type DocumentKind, type DocumentStatus } from '@shared/lib/teaching';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Academic Documents — the Director's and Coordinator's review of lesson plans, TOS and PT. */

export async function loadAcademicReviews({ query }: PageRequest) {
  const sp = query;
  const ctx = await yearPage(teachingPolicy.viewAcademicDocuments, sp.year);
  const kind = DOCUMENT_KINDS.includes(sp.kind as DocumentKind) ? (sp.kind as DocumentKind) : null;
  const status = DOCUMENT_STATUSES.includes(sp.status as DocumentStatus) && sp.status !== 'DRAFT' ? (sp.status as DocumentStatus) : null;
  const rows = await reviewQueue(ctx.user, { kind, status, schoolYearId: ctx.yearId });

  return { ctx, kind, rows, status };
}
