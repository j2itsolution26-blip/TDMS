"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./navItems";

function labelFor(segment: string, href: string): string {
  const match = NAV_ITEMS.find((item) => item.href === href);
  if (match) return match.label;
  // Fallback for sub-routes (e.g. /programs/new) not in the nav list.
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    return { href, label: labelFor(segment, href) };
  });

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm text-slate-500 sm:flex">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <span key={crumb.href} className="flex items-center gap-1.5">
            {index > 0 && <span className="text-slate-300">/</span>}
            {isLast ? (
              <span className="font-medium text-slate-800">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-slate-700">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
