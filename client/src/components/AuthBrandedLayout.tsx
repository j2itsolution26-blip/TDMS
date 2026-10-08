import type { ReactNode } from 'react';
import LoginShell from '@/components/login/LoginShell';

/**
 * The layout every pre-auth page imports. Kept as a stable name so the seven
 * sign-in screens need no edits when the shell's design changes; the design
 * itself lives in src/components/login/.
 */
export default function AuthBrandedLayout({
  children,
  heading,
}: {
  children: ReactNode;
  /** The line under the card title. */
  heading?: string;
}) {
  return <LoginShell heading={heading}>{children}</LoginShell>;
}
