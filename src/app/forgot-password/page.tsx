import Link from "next/link";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Forgot your password?</h1>
        <p className="mt-2 text-sm text-slate-600">
          Self-service password reset isn&apos;t available yet. Please contact your
          administrator to have your password reset.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-emerald-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
