import StudentsScreen from '@/components/screens/StudentsScreen';
import { Page } from '@/lib/page-data';
import type { loadStudents } from '@/server/controllers/pages/app/students';

type Data = Awaited<ReturnType<typeof loadStudents>>;

/** /students */
export default function StudentsPage() {
  return <Page<Data> endpoint={'/students'} render={(d) => <StudentsScreen {...d} />} />;
}
