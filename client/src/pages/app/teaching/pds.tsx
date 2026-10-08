import { PageShell } from '@/components/teaching/kit';
import PdsEditor from '@/components/teaching/PdsEditor';
import { Page } from '@/lib/page-data';
import type { loadTeachingPds } from '@/server/controllers/pages/app/teaching/pds';

type Data = Awaited<ReturnType<typeof loadTeachingPds>>;

function View({ pds, user }: Data) {
  return (
    <PageShell eyebrow="Profile" title="Personal Data Sheet" description="Your personal, family, education, eligibility, work and training record. Viewable by the TVET Director.">
      <PdsEditor initial={pds.data} name={user.name} email={user.email} />
    </PageShell>
  );
}

/** /teaching/pds */
export default function TeachingPdsPage() {
  return <Page<Data> endpoint={'/teaching/pds'} render={(d) => <View {...d} />} />;
}
