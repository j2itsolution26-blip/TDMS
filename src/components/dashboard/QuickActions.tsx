import Link from "next/link";

export function QuickActions({ actions }: { actions: { label: string; href: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-center text-sm font-medium text-ink transition-colors hover:border-green-accent/40 hover:bg-soft-green hover:text-forest-deep"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
