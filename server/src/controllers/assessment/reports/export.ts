import { withErrorHandling, requestContext } from '@/server/lib/api-handler';
import { requireApiUser, authorize } from '@/server/auth/current-user';
import { assessmentCenterPolicy } from '@/server/auth/policies';
import { reportFilterSchema } from '@/server/schemas/assessment-center';
import { auditReport, buildReport, reportToCsv } from '@/server/services/assessment-center/reports';

/**
 * GET /api/v1/assessment/reports/export — the batch result report as CSV,
 * for the same filters as the report page. Recorded in the audit log.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const user = await requireApiUser();
  authorize(assessmentCenterPolicy.viewReports(user));
  const filters = reportFilterSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  const report = await buildReport(filters, user);
  await auditReport('exported', report, user, requestContext(request));

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(reportToCsv(report), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assessment-results-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
