import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "./SetupForm";

// Must re-check on every request, not just once at build time — a
// statically-prerendered "no super admin yet" result would keep this
// form reachable forever, even after the first Super Admin is created.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // The setup form only exists while no super_admin has ever been
  // created — once one exists, this route sends everyone to the normal
  // login page instead. Normal users can never reach this form through
  // the public login page.
  const existingSuperAdmin = await prisma.userRole.findFirst({
    where: { role: { name: "super_admin" } },
  });
  if (existingSuperAdmin) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            TVET Diploma Management System
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Create Initial Super Admin</h1>
          <p className="mt-1 text-sm text-slate-500">
            One-time setup — only available while no Super Admin account exists yet.
          </p>
        </div>

        <SetupForm />
      </div>
    </div>
  );
}
