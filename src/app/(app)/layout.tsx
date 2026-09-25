import { requireUser } from '@/server/auth/current-user';
import Navigation, { type NavItem } from '@/components/Navigation';
import {
  programPolicy,
  subjectPolicy,
  studentPolicy,
  applicationPolicy,
  userPolicy,
} from '@/server/auth/policies';

/**
 * Port of layouts/app.blade.php.
 *
 * Wraps every signed-in page: sidebar, topbar, and the same
 * `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8` content well as the Blade
 * layout, under `lg:pl-64` to clear the fixed sidebar.
 *
 * requireUser() here is what makes the whole group private — it resolves
 * and validates the session server-side and redirects anonymous visitors,
 * so no page in this segment can accidentally render without a principal.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // The @can guards from the Blade sidebar, evaluated on the server.
  const items: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', match: ['/dashboard'], icon: 'dashboard' },
  ];

  if (programPolicy.viewAny(user)) {
    items.push({
      label: 'Programs',
      href: '/programs',
      match: ['/programs', '/curricula'],
      icon: 'programs',
    });
  }
  if (subjectPolicy.viewAny(user)) {
    items.push({ label: 'Subjects', href: '/subjects', match: ['/subjects'], icon: 'subjects' });
  }
  if (studentPolicy.viewAny(user)) {
    items.push({ label: 'Students', href: '/students', match: ['/students'], icon: 'students' });
  }
  if (applicationPolicy.viewAny(user)) {
    items.push({
      label: 'Applications',
      href: '/applications',
      match: ['/applications'],
      icon: 'applications',
    });
  }
  if (userPolicy.viewAny(user)) {
    items.push({ label: 'Staff', href: '/staff', match: ['/staff'], icon: 'staff' });
  }

  return (
    <div className="min-h-screen">
      <Navigation
        items={items}
        user={{ name: user.name, email: user.email, role: user.roles[0] ?? null }}
      />
      <main className="lg:pl-64">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
