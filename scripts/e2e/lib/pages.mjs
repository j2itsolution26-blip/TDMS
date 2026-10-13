/**
 * Page requests for the e2e suites, in the React + Fastify architecture.
 *
 * A page URL (/dashboard, /staff, …) is now the React app; what the page
 * shows and where it sends the visitor come from its server loader at
 * /api/v1/pages/<same path>. This turns the loader's answer back into what a
 * server-rendered page used to return, so the suites' checks keep their
 * meaning:
 *
 *   loader redirect / 401  ->  307 with Location (to /login?redirect=… for 401)
 *   loader data            ->  200 whose text is the page's data plus the app
 *                              shell's (the layout that wrapped every page)
 *   403 / 404 / 5xx        ->  the same status
 */
export async function fetchPage(base, path, headers = {}) {
  const res = await fetch(`${base}/api/v1/pages${path}`, { headers, redirect: 'manual' });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}

  const redirect = (location) => ({ status: 307, text: '', location, headers: res.headers, setCookie: res.headers.getSetCookie?.() ?? [] });

  if (res.status === 401) {
    const back = path === '/' ? '' : `?redirect=${encodeURIComponent(path)}`;
    return redirect(`/login${back}`);
  }
  if (res.ok && body?.redirect) {
    const location = body.redirect === '/login' && path !== '/login' ? `/login?redirect=${encodeURIComponent(path)}` : body.redirect;
    return redirect(location);
  }

  let shellText = '';
  if (res.ok && !path.startsWith('/login') && !['/setup', '/change-password', '/forgot-password', '/reset-password', '/verify-email'].some((p) => path.startsWith(p))) {
    const shell = await fetch(`${base}/api/v1/pages/app-shell`, { headers });
    shellText = await shell.text();
  }
  return { status: res.status, text: `${text}\n${shellText}`, location: null, headers: res.headers, setCookie: res.headers.getSetCookie?.() ?? [] };
}

export const isPagePath = (path) => !path.startsWith('/api/');
