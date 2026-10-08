import type { ReactNode } from 'react';
import { AlertIcon, InfoIcon } from './icons';

/**
 * A sign-in message banner.
 *
 * Errors use role="alert" so they are announced the moment they appear;
 * informational and warning notices use role="status", which waits its turn.
 * Every tone carries an icon and a title, so meaning never rests on colour.
 */
export default function AuthError({
  id,
  tone = 'error',
  title,
  children,
}: {
  id?: string;
  tone?: 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className={`auth-alert auth-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'info' ? <InfoIcon className="auth-alert__icon" /> : <AlertIcon className="auth-alert__icon" />}
      <div>
        {title && <p className="auth-alert__title">{title}</p>}
        <p className="auth-alert__body">{children}</p>
      </div>
    </div>
  );
}
