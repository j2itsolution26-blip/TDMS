import Link from "next/link";

export function QuickActions({ actions }: { actions: { label: string; href: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-lg border border-slate-200 px-3 py-2.5 text-center text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
        >
          {action.label}
        </Link>
      ))}
    </div>
  );
}
