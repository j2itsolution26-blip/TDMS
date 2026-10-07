'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthError from '@/components/auth/AuthError';

const REDIRECT_AFTER_MS = 3000;

/** Shown at /setup once the system is initialized, then off to /login. */
export default function AlreadyInitialized() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace('/login'), REDIRECT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div>
      <div className="panel__status">
        <AuthError tone="info" title="TDMS has already been initialized.">
          Taking you to the sign-in page…
        </AuthError>
      </div>
      <Link href="/login" replace className="tdms-submit">
        <span>Go to Sign In</span>
      </Link>
    </div>
  );
}
