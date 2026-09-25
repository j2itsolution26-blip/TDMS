import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-indigo-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-navy-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page you were looking for does not exist or has moved.
      </p>
      <Link href="/dashboard" className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-700">
        Back to dashboard
      </Link>
    </div>
  );
}
