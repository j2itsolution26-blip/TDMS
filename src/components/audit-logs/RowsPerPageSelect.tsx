"use client";

import { useRouter } from "next/navigation";
import { PAGE_SIZE_OPTIONS } from "@/lib/audit-log-presentation";

export function RowsPerPageSelect({
  perPage,
  searchParams,
}: {
  perPage: number;
  searchParams: Record<string, string | undefined>;
}) {
  const router = useRouter();

  function onChange(value: string) {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(searchParams)) {
      if (val && key !== "page" && key !== "perPage") params.set(key, val);
    }
    params.set("perPage", value);
    params.set("page", "1"); // changing page size invalidates the current offset
    router.push(`/audit-logs?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      Rows per page
      <select
        value={perPage}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 py-1 pl-2 pr-7 text-sm text-ink shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </label>
  );
}
