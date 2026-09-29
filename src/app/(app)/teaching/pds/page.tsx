import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { ownPds } from '@/server/services/teaching/pds';
import { PageShell } from '@/components/teaching/kit';
import PdsEditor from '@/components/teaching/PdsEditor';

export const dynamic = 'force-dynamic';

/** The Instructor's own Personal Data Sheet. */
export default async function PdsPage() {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const pds = await ownPds(user);
  return (
    <PageShell eyebrow="Profile" title="Personal Data Sheet" description="Your personal, family, education, eligibility, work and training record. Viewable by the TVET Director.">
      <PdsEditor initial={pds.data} name={user.name} email={user.email} />
    </PageShell>
  );
}
