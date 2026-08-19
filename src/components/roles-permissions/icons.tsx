type IconProps = { className?: string };
const base = "none";
const common = { fill: base, stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function SuperAdminIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function AdminIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function DirectorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M3 21V8l9-5 9 5v13" />
      <path d="M9 21v-6h6v6M9 12h.01M15 12h.01M9 8h.01M15 8h.01" />
    </svg>
  );
}

export function CoordinatorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function SecretaryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4" />
      <path d="M9 12h6M9 16h6" />
    </svg>
  );
}

export function TeacherIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1.5 2.5 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

export function StudentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
    </svg>
  );
}

export const ROLE_ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  super_admin: SuperAdminIcon,
  admin: AdminIcon,
  director: DirectorIcon,
  coordinator: CoordinatorIcon,
  secretary: SecretaryIcon,
  teacher: TeacherIcon,
  student: StudentIcon,
};

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function DashSmallIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" {...common} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
