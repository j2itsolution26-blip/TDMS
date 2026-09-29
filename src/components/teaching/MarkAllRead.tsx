'use client';

import { api } from '@/lib/api-client';
import { useAction } from './client-kit';
import { BTN_SECONDARY } from './kit';

export default function MarkAllRead() {
  const { busy, run } = useAction();
  return (
    <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => run(() => api.post('/api/notifications', { all: true }))}>
      Mark all read
    </button>
  );
}
