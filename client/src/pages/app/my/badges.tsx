import { Card, Empty, PageShell } from '@/components/teaching/kit';
import { Page } from '@/lib/page-data';
import type { loadMyBadges } from '@/server/controllers/pages/app/my/badges';

type Data = Awaited<ReturnType<typeof loadMyBadges>>;

function View({ badges }: Data) {
  return (
    <PageShell eyebrow="My Learning" title="My Badges" description="Recognition from your Diploma Instructors.">
      {badges.length === 0 ? (
        <Empty title="No badges yet" description="Badges your instructors award you will appear here." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {badges.map((b) => (
            <li key={b.id}>
              <Card className="h-full">
                <div className="flex gap-4 pt-5">
                  <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-tdms-wash text-3xl">{b.emoji}</span>
                  <div className="min-w-0">
                    <p className="text-base font-bold text-tdms-ink">{b.label}</p>
                    <p className="text-sm">{b.reason}</p>
                    {b.message && <p className="mt-1 text-sm italic">“{b.message}”</p>}
                    <p className="mt-2 text-xs text-tdms-muted">{b.instructor ?? 'Your instructor'}{b.subject ? ` · ${b.subject}` : ''} · <span className="tabular-nums">{b.awardedOn}</span></p>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

/** /my/badges */
export default function MyBadgesPage() {
  return <Page<Data> endpoint={'/my/badges'} render={(d) => <View {...d} />} />;
}
