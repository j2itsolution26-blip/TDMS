import { requireUser } from "@/server/rbac";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Source of truth for "is this request authenticated" — not the
  // cookie check in middleware.ts, which only exists as a fast
  // redirect for a better UX before this real check runs.
  const user = await requireUser();

  return <DashboardLayout user={user}>{children}</DashboardLayout>;
}
