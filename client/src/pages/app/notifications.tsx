import Link from '@/lib/link';
import { diffForHumans } from '@shared/lib/dates';
import { Card, Empty, FOCUS, PageShell } from '@/components/teaching/kit';
import { Pagination } from '@/components/ui';
import MarkAllRead from '@/components/teaching/MarkAllRead';
import { Page } from '@/lib/page-data';
import type { loadNotifications } from '@/server/controllers/pages/app/notifications';

type Data = Awaited<ReturnType<typeof loadNotifications>>;

function View({ data, page, unread }: Data) {
  return (
    <PageShell title="Notifications" description="Attendance, scores, grades, badges, reviews, requests and announcements." actions={unread ? <MarkAllRead /> : null}>
      <Card padded={false}>
        {data.rows.length === 0 ? (
          <div className="p-5 sm:p-6"><Empty title="No notifications yet" description="You will be notified here about things that concern you." /></div>
        ) : (
          <ul className="divide-y divide-tdms-hairline">
            {data.rows.map((r) => {
              const body = (
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${r.read ? 'bg-transparent' : 'bg-tdms-green'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${r.read ? 'font-medium text-tdms-muted' : 'font-bold text-tdms-ink'}`}>{r.title}{!r.read && <span className="sr-only"> (unread)</span>}</p>
                    {r.body && <p className="text-[13px] text-tdms-muted">{r.body}</p>}
                  </div>
                  <time className="shrink-0 text-xs text-tdms-muted" dateTime={r.createdAt}>{diffForHumans(r.createdAt)}</time>
                </div>
              );
              return (
                <li key={r.id}>
                  {r.href ? <Link href={r.href} className={`block px-5 py-3.5 hover:bg-tdms-bg sm:px-6 ${FOCUS}`}>{body}</Link> : <div className="px-5 py-3.5 sm:px-6">{body}</div>}
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={data.page} lastPage={data.lastPage} total={data.total} basePath="/notifications" />
      </Card>
    </PageShell>
  );
}

/** /notifications */
export default function NotificationsPage() {
  return <Page<Data> endpoint={'/notifications'} render={(d) => <View {...d} />} />;
}
