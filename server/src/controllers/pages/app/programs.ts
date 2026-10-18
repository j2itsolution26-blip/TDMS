import { requireUser, authorizePage } from '@/server/auth/current-user';
import { programPolicy, studentPolicy } from '@/server/auth/policies';
import { programOverview } from '@/server/services/catalogue-service';

/**
 * Port of livewire/programs/index.blade.php (the mount() authorize + with()),
 * now with each program's currently enrolled students. Every program is sent
 * (there are a handful); the page searches and filters them in the browser.
 */

export async function loadPrograms() {
  const user = await requireUser();
  authorizePage(programPolicy.viewAny(user));

  return {
    ...(await programOverview()),
    canCreate: programPolicy.create(user),
    canUpdate: programPolicy.update(user),
    // View Students links to /students, which has its own policy.
    canViewStudents: studentPolicy.viewAny(user),
  };
}
