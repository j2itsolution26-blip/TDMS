export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-app-bg px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-soft">{title}</p>
      {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
    </div>
  );
}
