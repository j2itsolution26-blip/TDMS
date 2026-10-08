import { useEffect, useRef } from 'react';
import { useSearchParams } from '@/lib/navigation';

/**
 * Opens a screen's "create" form when the URL asks for it with `?new=1` — the
 * dashboard's "Create program", "Invite staff" and "Add student" land on the
 * page with its form already open.
 *
 * Only when the viewer may create (the page passes its policy); otherwise the
 * page simply shows as usual. The parameter is then dropped from the address
 * bar, so a refresh or Back does not open the form a second time.
 */
export function useOpenOnNew(canCreate: boolean, open: () => void): void {
  const wanted = useSearchParams().get('new') === '1';
  const handled = useRef(false);

  useEffect(() => {
    if (!wanted || handled.current) return;
    handled.current = true;
    if (canCreate) open();
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    window.history.replaceState(window.history.state, '', url);
  }, [wanted, canCreate, open]);
}
