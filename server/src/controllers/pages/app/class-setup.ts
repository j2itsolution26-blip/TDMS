import { teachingPolicy } from '@/server/auth/policies';
import { classSetupOverview } from '@/server/services/teaching/class-setup';
import { yearPage } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** Classes & Sections — the Admin's and Coordinator's setup of a school year. */

export async function loadClassSetup({ query }: PageRequest) {
  const { year } = query;
  const ctx = await yearPage(teachingPolicy.manageClasses, year);
  const setup = ctx.yearId ? await classSetupOverview(ctx.yearId) : null;

  return { ctx, setup };
}
