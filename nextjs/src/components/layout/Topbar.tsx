import { logout } from "@/app/(app)/actions";
import type { SessionUser } from "@/server/session";

export function Topbar({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500">
        Signed in as <span className="font-medium text-slate-800">{user.name}</span>
        <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium capitalize text-emerald-700">
          {user.roles.join(", ").replace(/_/g, " ") || "no role"}
        </span>
      </div>
      <form action={logout}>
        <button type="submit" className="text-sm font-medium text-slate-500 hover:text-red-600">
          Sign out
        </button>
      </form>
    </header>
  );
}
