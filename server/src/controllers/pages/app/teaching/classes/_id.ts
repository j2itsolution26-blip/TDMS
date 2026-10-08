import { notFound } from '@/server/lib/page-signals';
import { authorizePage, requireUser } from '@/server/auth/current-user';
import { teachingPolicy } from '@/server/auth/policies';
import { classHeading, classRoster, requireInstructorClass, studentName } from '@/server/services/teaching/access';
import { orNotFound, queryId } from '@/server/services/teaching/page-context';
import type { PageRequest } from '@/server/controllers/pages/types';

/** One class: its schedule, its roster and everything the Instructor does for it. */

export async function loadTeachingClassesId({ params }: PageRequest) {
  const user = await requireUser();
  authorizePage(teachingPolicy.teach(user));
  const id = queryId((params).id);
  if (!id) notFound();
  const cls = await orNotFound(requireInstructorClass(user, id));
  const roster = await classRoster(cls.sectionId);
  const h = classHeading(cls);
  const archived = cls.schoolYear.status === 'ARCHIVED';
  const q = `class=${cls.id}&year=${cls.schoolYearId}`;

  const links = [
    { label: 'Take Attendance', href: `/teaching/attendance?${q}`, primary: true },
    { label: 'Attendance Records', href: `/teaching/attendance-records?${q}` },
    { label: 'Gradebook', href: `/teaching/gradebook?${q}` },
    { label: 'Class Record', href: `/teaching/records?${q}` },
    { label: 'Quizzes', href: `/teaching/quizzes?${q}` },
    { label: 'Examinations', href: `/teaching/exams?${q}` },
    { label: 'Online Activities', href: `/teaching/activities?${q}` },
    { label: 'Performance Tasks', href: `/teaching/performance-tasks?${q}` },
  ];

  return { archived, cls, h, id, links, roster };
}
