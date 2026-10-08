import { useParams } from 'react-router-dom';
import { PageShell } from '@/components/teaching/kit';
import PdsEditor from '@/components/teaching/PdsEditor';
import { Page } from '@/lib/page-data';
import type { loadInstructorsId } from '@/server/controllers/pages/app/instructors/_id';

type Data = Awaited<ReturnType<typeof loadInstructorsId>>;

/** /instructors/:id — an Instructor's PDS, read-only. */
export default function InstructorsIdPage() {
  const { id } = useParams() as { id: string };
  return (
    <Page<Data>
      endpoint={`/instructors/${id}`}
      render={({ pds }) => (
        <PageShell back={{ href: '/instructors', label: 'Instructor Profiles' }} eyebrow="Personal Data Sheet" title={pds.instructor.name} description={`${pds.instructor.email}${pds.updatedAt ? ` · last updated ${pds.updatedAt.slice(0, 10)}` : ' · not filled in yet'}`}>
          <PdsEditor initial={pds.data} readOnly name={pds.instructor.name} email={pds.instructor.email} />
        </PageShell>
      )}
    />
  );
}
