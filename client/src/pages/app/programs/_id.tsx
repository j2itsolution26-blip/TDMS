import ProgramDetailScreen from '@/components/screens/ProgramDetailScreen';
import { useParams } from 'react-router-dom';
import { Page } from '@/lib/page-data';
import type { loadProgramsId } from '@/server/controllers/pages/app/programs/_id';

type Data = Awaited<ReturnType<typeof loadProgramsId>>;

/** /programs/[id] */
export default function ProgramsIdPage() {
  const { id } = useParams() as { id: string };
  return <Page<Data> endpoint={`/programs/${id}`} render={(d) => <ProgramDetailScreen {...d} />} />;
}
