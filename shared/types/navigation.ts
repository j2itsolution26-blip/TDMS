/** The sidebar's items, built on the server (app-shell loader) and drawn by Navigation. */

export interface NavItem {
  label: string;
  href: string;
  /** Route prefixes that should light this item up. */
  match: string[];
  icon: NavIcon;
  /** The sidebar section. Sections appear in the order their first item does. */
  group: NavGroup;
}

export type NavIcon =
  | 'dashboard' | 'programs' | 'subjects' | 'students' | 'applications' | 'enrollments' | 'staff' | 'admins' | 'keys' | 'audit' | 'health' | 'profile'
  | 'classes' | 'records' | 'gradebook' | 'qr' | 'attendance' | 'quiz' | 'exam' | 'checking' | 'activity' | 'task' | 'progress' | 'support'
  | 'document' | 'tos' | 'badge' | 'calendar' | 'pds' | 'schoolYears' | 'setup' | 'reviews' | 'statusRequests' | 'instructors' | 'notifications';

export type NavGroup =
  | 'main' | 'academic' | 'people' | 'records' | 'admissions' | 'programs' | 'system' | 'account'
  | 'teaching' | 'attendance' | 'assessments' | 'activities' | 'documents' | 'engagement' | 'calendar' | 'profile'
  | 'oversight' | 'learning';
