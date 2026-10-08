import EnrollmentScreen from '@/components/screens/EnrollmentScreen';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadStudentsIdEnrollment } from '@/server/controllers/pages/app/students/_id/enrollment';

type Data = Awaited<ReturnType<typeof loadStudentsIdEnrollment>>;

/** /students/[id]/enrollment */
export default function StudentsIdEnrollmentPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/students/${id}/enrollment`} render={(d) => <EnrollmentScreen {...d} />} />;
}
