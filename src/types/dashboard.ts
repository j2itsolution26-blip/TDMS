/**
 * The shape of a dashboard, shared by the data service and the components
 * that draw it.
 *
 * Every role gets the SAME layout — heading, KPIs, two operational panels, an
 * analytic, quick actions, recent activity — filled with DIFFERENT data. That
 * is what keeps seven dashboards from becoming seven copies of the same JSX:
 * the service decides what each role sees, and one renderer draws it.
 *
 * Nothing in here is a promise that a panel has data. Most TDMS tables can be
 * empty, and every list and chart carries its own empty state so a zero is
 * never shown without saying what it means.
 */

export type DashboardRole =
  | 'super_admin'
  | 'admin'
  | 'director'
  | 'coordinator'
  | 'secretary'
  | 'teacher'
  | 'student'
  | 'none';

/** The icon set the dashboard draws. Named by meaning, not by picture. */
export type DashboardIcon =
  | 'users'
  | 'active'
  | 'session'
  | 'programs'
  | 'shield'
  | 'health'
  | 'students'
  | 'staff'
  | 'applications'
  | 'enrollment'
  | 'documents'
  | 'subjects'
  | 'curricula'
  | 'profile'
  | 'audit'
  | 'keys'
  | 'units'
  | 'calendar';

export interface Kpi {
  key: string;
  label: string;
  /**
   * A figure the viewer is not allowed to see is not a card with a blank
   * value — it is simply not in the list. The service only builds the cards a
   * role's policies permit.
   */
  value: number | string;
  /** A short line under the value: a trend, a qualifier, or what zero means. */
  hint?: string;
  /** Colours the hint. Never the only signal — the hint text says it too. */
  tone?: 'neutral' | 'positive' | 'attention';
  icon: DashboardIcon;
  /** Where the number comes from, when there is a page for it. */
  href?: string;
  /**
   * A real ratio drawn as a thin bar under the figure — "4 of 6 programs
   * active". Only set where both numbers exist; never a decorative bar.
   */
  progress?: { value: number; max: number; label: string };
}

export interface StatusLabel {
  /** Semantic key for the badge colour: active, pending, completed, … */
  status: string;
  label: string;
}

export interface ListItem {
  id: string;
  title: string;
  subtitle?: string;
  /** Right-hand detail: a count, a time, a date. */
  meta?: string;
  /** ISO timestamp; drawn as "5 min ago" at render time. */
  at?: string;
  status?: StatusLabel;
  href?: string;
  /** A glyph for the row's kind, where a layout draws one (the Director's activity feed). */
  icon?: DashboardIcon;
}

export interface EmptyNote {
  title: string;
  description: string;
  action?: { label: string; href: string };
}

export interface ListPanel {
  title: string;
  description?: string;
  viewAll?: { label: string; href: string };
  items: ListItem[];
  empty: EmptyNote;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartPanel {
  title: string;
  description: string;
  kind: 'bars' | 'breakdown' | 'donut';
  points: ChartPoint[];
  /** What the numbers count, for the axis and the accessible summary. */
  unit: string;
  empty: EmptyNote;
}

/**
 * A labelled figure or state, with a badge that says in words what the colour
 * means. The row a status panel is made of.
 */
export interface StatusRow {
  label: string;
  value?: string;
  status?: StatusLabel;
  href?: string;
}

/**
 * A compact panel of states — "is this set up, is that running" — with the
 * actions that act on them. Used where a list of events would be the wrong
 * shape: the Super Admin's Admin Access and System Status.
 */
export interface StatusPanel {
  id: string;
  title: string;
  description?: string;
  rows: StatusRow[];
  actions?: { label: string; href: string; primary?: boolean }[];
}

/** A small table of records: the Director's Program Oversight and Recent Applications. */
export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Drops the column on narrow screens so the table fits without scrolling. */
  hideOnMobile?: boolean;
}

/** A cell: plain text, a status badge, or a primary line with a smaller second one. */
export type TableCell = string | StatusLabel | { text: string; sub?: string };

export interface TableRow {
  id: string;
  href?: string;
  cells: Record<string, TableCell>;
}

export interface TablePanel {
  id: string;
  title: string;
  description?: string;
  viewAll?: { label: string; href: string };
  columns: TableColumn[];
  rows: TableRow[];
  empty: EmptyNote;
}

// --- TVET role workspaces (Director, Coordinator, Secretary) -------------------------

/**
 * One design system, three jobs. The Director oversees, the Coordinator runs
 * the academic structure, the Secretary processes records — so each gets its
 * own panels, drawn from the same small kit of parts.
 *
 * Every number is a count from the records, gated by the policy that guards
 * the page it summarises. Where TDMS keeps no record of something a role would
 * naturally watch (grades, competencies, assessments, teacher assignments),
 * the workspace lists it under `notTracked` and the page says so plainly —
 * never a zero that looks like a measurement.
 */

export type WorkIcon =
  | 'programs'
  | 'students'
  | 'teachers'
  | 'applications'
  | 'enrollment'
  | 'curricula'
  | 'subjects'
  | 'documents'
  | 'attention'
  | 'graduation'
  | 'registrations'
  | 'tasks'
  | 'records';

export type WorkTone = 'success' | 'attention' | 'failed' | 'info' | 'neutral';

export interface WorkMetric {
  key: string;
  label: string;
  value: number;
  /** What the number means, in words: "3 awaiting approval", "None created yet". */
  hint: string;
  tone?: WorkTone;
  icon: WorkIcon;
  href?: string;
}

/** Something waiting, with a count and the button that opens it. */
export interface WorkItem {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  /** The button's verb: Review, Open, View. */
  action: string;
  icon: WorkIcon;
}

/** One stage of a breakdown — a pipeline step, a document state. */
export interface WorkSegment {
  key: string;
  label: string;
  value: number;
  tone: WorkTone;
  href?: string;
}

/** A real ratio: "4 of 6 active programs have a curriculum". */
export interface WorkProgress {
  key: string;
  label: string;
  value: number;
  max: number;
  detail: string;
}

export interface QuickLink {
  label: string;
  description: string;
  href: string;
  icon: WorkIcon;
}

export interface ProgramPerformanceRow {
  id: string;
  name: string;
  code: string;
  students: number | null;
  active: number | null;
  graduating: number | null;
  graduated: number | null;
  pendingApplications: number | null;
  status: StatusLabel;
}

export interface GraduationRow {
  id: string;
  name: string;
  studentNumber: string;
  program: string;
  yearLevel: number;
  /** Required documents still not verified. */
  outstanding: number;
}

export interface ProgramReadiness {
  id: string;
  name: string;
  code: string;
  curriculum: string | null;
  subjects: number;
  units: number;
  /** Year/semester terms in the curriculum that have no subject yet. */
  emptyTerms: number;
  ready: boolean;
  status: StatusLabel;
}

export interface EnrollmentByProgramRow {
  id: string;
  name: string;
  code: string;
  applications: number;
  approved: number;
  enrolled: number;
  pending: number;
}

interface WorkspaceBase {
  metrics: WorkMetric[];
  activity: ListItem[];
  quickActions: QuickLink[];
  /** What this role would watch but TDMS does not record yet. */
  notTracked: string[];
}

export interface DirectorWorkspace extends WorkspaceBase {
  kind: 'director';
  actions: WorkItem[];
  programs: ProgramPerformanceRow[] | null;
  progression: WorkSegment[] | null;
  graduation: GraduationRow[] | null;
}

export interface CoordinatorWorkspace extends WorkspaceBase {
  kind: 'coordinator';
  tasks: WorkItem[];
  readiness: ProgramReadiness[] | null;
  progress: WorkProgress[] | null;
}

export interface SecretaryWorkspace extends WorkspaceBase {
  kind: 'secretary';
  queue: WorkItem[];
  pipeline: WorkSegment[] | null;
  enrollmentByProgram: EnrollmentByProgramRow[] | null;
  documents: WorkSegment[] | null;
}

export type RoleWorkspace = DirectorWorkspace | CoordinatorWorkspace | SecretaryWorkspace;

export interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: DashboardIcon;
}

// --- Admin workspace ---------------------------------------------------------------

export type SetupStepKey = 'admin' | 'program' | 'subjects' | 'staff' | 'applications';

/**
 * One step of getting TDMS ready, decided by the records themselves — a
 * program exists, a subject exists — never by a flag someone ticks.
 */
export interface SetupStep {
  key: SetupStepKey;
  title: string;
  /** What is true now: "Account verified", "1 teacher account so far". */
  detail: string;
  done: boolean;
  href: string;
  /** The verb on the step's button: Create, Add, Invite, Open. */
  action: string;
}

/**
 * The one setup state the dashboard checklist, the hero and the sidebar card
 * all read, so they can never disagree.
 */
export interface SetupProgress {
  steps: SetupStep[];
  completed: number;
  total: number;
  /** The first step not yet done; null once everything is. */
  current: SetupStepKey | null;
  complete: boolean;
}

export type PendingKey = 'applications' | 'returned' | 'documents' | 'enrollments' | 'staff';

/** Work waiting on the office, as counts. The bell and Operational Tasks read it. */
export interface PendingItem {
  key: PendingKey;
  label: string;
  count: number;
  href: string;
}

export interface PendingWork {
  items: PendingItem[];
  total: number;
}

/** A stat card on the Admin dashboard. */
export interface AdminStat {
  key: 'students' | 'teachers' | 'programs' | 'applications' | 'enrollments';
  label: string;
  value: number;
  /** The small tag top-right: "+1 new", "Next step", "0 pending". */
  tag: string;
  link: { label: string; href: string };
  /** Monthly counts for the faint sparkline; absent when there is no trend. */
  trend?: number[];
}

export interface AdminQuickAction {
  key: 'program' | 'subject' | 'staff' | 'student';
  label: string;
  caption: string;
  href: string;
  /** Present when the action cannot be taken yet — the caption says why. */
  disabled?: boolean;
}

export interface AdminPanels {
  /** Null for an account that is not an Admin (a Super Admin never sees setup). */
  setup: SetupProgress | null;
  stats: AdminStat[];
  pending: PendingWork;
  activity: ListItem[];
  quickActions: AdminQuickAction[];
  /** Students added per month, last 6 months; null when students are not visible. */
  newStudents: ChartPoint[] | null;
  /** "1st Semester, SY 2026–2027" — from the enrollment records, never guessed. */
  term: string;
}

export interface DashboardView {
  role: DashboardRole;
  roleLabel: string;
  title: string;
  description: string;
  kpis: Kpi[];
  primary: ListPanel | null;
  secondary: ListPanel | null;
  chart: ChartPanel | null;
  quickActions: QuickAction[];
  activity: ListPanel | null;
  /** Optional state panels, drawn after the main row. Empty for most roles. */
  statusPanels?: StatusPanel[];
  /**
   * Set for the Director, Coordinator and Secretary: the page draws that
   * role's workspace instead of the shared primary/secondary/chart row.
   */
  workspace?: RoleWorkspace;
  /** Set for the Admin only: the page draws the Admin workspace from these. */
  admin?: AdminPanels;
  /**
   * An honest note about what this role's dashboard cannot show yet — the
   * teaching and learning records TDMS does not hold. Shown once, plainly,
   * instead of empty cards pretending to be features.
   */
  notice?: { title: string; body: string };
}
