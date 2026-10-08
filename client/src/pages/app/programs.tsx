import ProgramsScreen from '@/components/screens/ProgramsScreen';
import { Page } from '@/lib/page-data';
import type { loadPrograms } from '@/server/controllers/pages/app/programs';

type Data = Awaited<ReturnType<typeof loadPrograms>>;

/** /programs */
export default function ProgramsPage() {
  return <Page<Data> endpoint={'/programs'} render={(d) => <ProgramsScreen {...d} />} />;
}
