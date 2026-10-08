import AuditLogsView from '@/components/audit/AuditLogsView';
import { Page } from '@/lib/page-data';
import type { loadAuditLogs } from '@/server/controllers/pages/app/audit-logs';
import AuditLogsLoading from './audit-logs/AuditLogsLoading';
import AuditLogsError from './audit-logs/AuditLogsError';

type Data = Awaited<ReturnType<typeof loadAuditLogs>>;

/** /audit-logs — Super Admin only; the loader checks before reading. */
export default function AuditLogsPage() {
  return (
    <Page<Data>
      endpoint="/audit-logs"
      loading={<AuditLogsLoading />}
      error={(retry) => <AuditLogsError onRetry={retry} />}
      render={(d) => <AuditLogsView {...d} />}
    />
  );
}
