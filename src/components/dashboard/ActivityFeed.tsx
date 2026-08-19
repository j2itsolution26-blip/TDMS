import { EmptyState } from "@/components/ui/EmptyState";

export type ActivityEntry = { id: number; action: string; actor: string; createdAt: Date };

export function ActivityFeed({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState title="No recent activity" />;
  }

  return (
    <ul className="space-y-2">
      {entries.map((entry) => (
        <li key={entry.id} className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{entry.action.replace(/_/g, " ")}</span> — {entry.actor}{" "}
          <span className="text-slate-400">({entry.createdAt.toLocaleString()})</span>
        </li>
      ))}
    </ul>
  );
}
