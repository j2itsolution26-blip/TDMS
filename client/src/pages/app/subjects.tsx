import SubjectsScreen from '@/components/screens/SubjectsScreen';
import { Page } from '@/lib/page-data';
import type { loadSubjects } from '@/server/controllers/pages/app/subjects';

type Data = Awaited<ReturnType<typeof loadSubjects>>;

/** /subjects */
export default function SubjectsPage() {
  return <Page<Data> endpoint={'/subjects'} render={(d) => <SubjectsScreen {...d} />} />;
}
