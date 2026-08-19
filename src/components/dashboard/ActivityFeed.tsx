import { EmptyState } from "@/components/ui/EmptyState";
import { presentAction, type ActivityTone } from "./activityPresentation";
import {
  LoginIcon,
  LogoutIcon,
  KeyIcon,
  StaffIcon,
  ProgramsIcon,
  ShieldIcon,
  AlertIcon,
} from "@/components/layout/icons";

export type ActivityEntry = { id: number; action: string; actor: string; target: string; createdAt: Date };

const ICON_FOR_ACTION: Record<string, (p: { className?: string }) => React.ReactElement> = {
  LOGIN_SUCCESS: LoginIcon,
  LOGIN_FAILED: LoginIcon,
  LOGIN_BLOCKED_INACTIVE: LoginIcon,
  LOGOUT: LogoutIcon,
  STAFF_ACCOUNT_CREATED: StaffIcon,
  STAFF_ACCOUNT_UPDATED: StaffIcon,
  STAFF_ACCOUNT_ACTIVATED: StaffIcon,
  STAFF_ACCOUNT_DEACTIVATED: StaffIcon,
  STAFF_PASSWORD_RESET: KeyIcon,
  SUPER_ADMIN_BOOTSTRAPPED: ShieldIcon,
  PROGRAM_CREATED: ProgramsIcon,
  PROGRAM_UPDATED: ProgramsIcon,
};

const TONE_CLASSES: Record<ActivityTone, string> = {
  success: "bg-soft-green text-emerald",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  info: "bg-sky-50 text-sky-700",
  neutral: "bg-slate-100 text-ink-soft",
};

function formatRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No recent activity" />;
  }

  return (
    <ul className="space-y-4">
      {entries.map((entry) => {
        const { title, tone } = presentAction(entry.action);
        const Icon = ICON_FOR_ACTION[entry.action] ?? AlertIcon;
        return (
          <li key={entry.id} className="flex items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{title}</p>
              <p className="truncate text-xs text-ink-soft">{entry.target}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-ink-muted" title={entry.createdAt.toLocaleString()}>
                {formatRelativeTime(entry.createdAt)}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-ink-muted/70">{entry.action}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
