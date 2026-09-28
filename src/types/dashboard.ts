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
  kind: 'bars' | 'breakdown';
  points: ChartPoint[];
  /** What the numbers count, for the axis and the accessible summary. */
  unit: string;
  empty: EmptyNote;
}

export interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: DashboardIcon;
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
  /**
   * An honest note about what this role's dashboard cannot show yet — the
   * teaching and learning records TDMS does not hold. Shown once, plainly,
   * instead of empty cards pretending to be features.
   */
  notice?: { title: string; body: string };
}
