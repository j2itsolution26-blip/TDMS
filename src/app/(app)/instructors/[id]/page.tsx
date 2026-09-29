import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { viewInstructorPds } from '@/server/services/teaching/pds';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import { PageShell } from '@/components/teaching/kit';
import PdsEditor from '@/components/teaching/PdsEditor';

export const dynamic = 'force-dynamic';

/** One Instructor's PDS, read-only, for the Director. Each view is audited. */
export default async function InstructorPdsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  authorizePage(teachingPolicy.viewInstructorProfiles(user));
  const id = queryId((await params).id);
  if (!id) notFound();
  const h = await headers();
  const pds = await orNotFound(
    viewInstructorPds(user, id, { ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, userAgent: h.get('user-agent') }),
  );

  return (
    <PageShell back={{ href: '/instructors', label: 'Instructor Profiles' }} eyebrow="Personal Data Sheet" title={pds.instructor.name} description={`${pds.instructor.email}${pds.updatedAt ? ` · last updated ${pds.updatedAt.slice(0, 10)}` : ' · not filled in yet'}`}>
      <PdsEditor initial={pds.data} readOnly name={pds.instructor.name} email={pds.instructor.email} />
    </PageShell>
  );
}
