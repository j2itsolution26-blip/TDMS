import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { SessionUser } from "@/server/session";

export function DashboardLayout({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
