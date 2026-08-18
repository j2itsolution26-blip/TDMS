import { requireGuest } from "./actions";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  await requireGuest();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
            TVET Diploma Management System
          </p>
          <h1 className="mt-2 text-xl font-bold text-slate-900">Sign in to your account</h1>
          <p className="mt-1 text-sm text-slate-500">Enter your credentials to continue</p>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
