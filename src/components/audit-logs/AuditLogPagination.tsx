import Link from "next/link";
import { RowsPerPageSelect } from "./RowsPerPageSelect";

function buildHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  return `/audit-logs?${next.toString()}`;
}

/** Windowed page list (max 5 numbers) so this stays readable at 40+ pages. */
function pageWindow(current: number, total: number): number[] {
  const size = 5;
  let start = Math.max(1, current - Math.floor(size / 2));
  const end = Math.min(total, start + size - 1);
  start = Math.max(1, end - size + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function AuditLogPagination({
  page,
  perPage,
  total,
  searchParams,
}: {
  page: number;
  perPage: number;
  total: number;
  searchParams: Record<string, string | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(total, page * perPage);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value && key !== "page" && key !== "perPage") params.set(key, value);
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <p className="text-sm text-ink-muted">
          Showing {rangeStart}–{rangeEnd} of {total} logs
        </p>
        <RowsPerPageSelect perPage={perPage} searchParams={searchParams} />
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <Link
            href={buildHref(params, Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${
              page <= 1 ? "pointer-events-none text-ink-muted/50" : "text-ink-soft hover:bg-app-bg"
            }`}
          >
            ‹ Previous
          </Link>

          {pageWindow(page, totalPages).map((p) => (
            <Link
              key={p}
              href={buildHref(params, p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                p === page ? "bg-forest-deep text-white" : "text-ink-soft hover:bg-app-bg"
              }`}
            >
              {p}
            </Link>
          ))}

          <Link
            href={buildHref(params, Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${
              page >= totalPages ? "pointer-events-none text-ink-muted/50" : "text-ink-soft hover:bg-app-bg"
            }`}
          >
            Next ›
          </Link>
        </nav>
      )}
    </div>
  );
}
