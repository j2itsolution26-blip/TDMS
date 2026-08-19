"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { splitActorLabel } from "@/services/audit-log.service";

const selectClassName =
  "block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-700";

function formatActionLabel(action: string): string {
  return action.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuditLogFilters({
  actions,
  actors,
  targets,
}: {
  actions: string[];
  actors: string[];
  targets: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local, uncommitted state — the URL (and therefore the query) only
  // changes on "Apply Filters", per the simpler/more reliable pattern:
  // no live-reload on every keystroke.
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [action, setAction] = useState(searchParams.get("action") ?? "");
  const [actor, setActor] = useState(searchParams.get("actor") ?? "");
  const [target, setTarget] = useState(searchParams.get("target") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");

  function applyFilters() {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (action) params.set("action", action);
    if (actor) params.set("actor", actor);
    if (target) params.set("target", target);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    // Preserve the chosen page size, but always jump back to page 1 —
    // a new filter combination invalidates whatever page you were on.
    const perPage = searchParams.get("perPage");
    if (perPage) params.set("perPage", perPage);

    router.push(`/audit-logs?${params.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setAction("");
    setActor("");
    setTarget("");
    setDateFrom("");
    setDateTo("");
    router.push("/audit-logs");
  }

  const hasActiveFilters = Boolean(search || action || actor || target || dateFrom || dateTo);

  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(23,53,44,0.04)] sm:p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="xl:col-span-2">
          <label htmlFor="audit-search" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Search
          </label>
          <Input
            id="audit-search"
            type="search"
            placeholder="Search actor, target, email, or action..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters();
            }}
          />
        </div>

        <div>
          <label htmlFor="audit-action" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Action
          </label>
          <select id="audit-action" className={selectClassName} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All Actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {formatActionLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-actor" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Actor
          </label>
          <select id="audit-actor" className={selectClassName} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">All Actors</option>
            {actors.map((value) => (
              <option key={value} value={value}>
                {splitActorLabel(value).name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-target" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Target
          </label>
          <select id="audit-target" className={selectClassName} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">All Targets</option>
            {targets.map((value) => (
              <option key={value} value={value}>
                {splitActorLabel(value).name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="audit-date-from" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Date From
            </label>
            <Input id="audit-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="audit-date-to" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Date To
            </label>
            <Input id="audit-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <Button type="button" onClick={applyFilters}>
          Apply Filters
        </Button>
        <Button type="button" variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
          Clear Filters
        </Button>
      </div>
    </div>
  );
}
