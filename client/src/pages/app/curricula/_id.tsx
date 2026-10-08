import CurriculumDetailScreen from '@/components/screens/CurriculumDetailScreen';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadCurriculaId } from '@/server/controllers/pages/app/curricula/_id';

type Data = Awaited<ReturnType<typeof loadCurriculaId>>;

/** /curricula/[id] */
export default function CurriculaIdPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/curricula/${id}`} render={(d) => <CurriculumDetailScreen {...d} />} />;
}
