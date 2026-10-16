// Sets the theme before the first paint, so a dark workspace never flashes light.
// A classic blocking script from 'self' (an inline one would break the CSP).
// Mirrors src/lib/theme.ts — keep OUTSIDE_APP and the key identical (a test checks).
(function () {
  var OUTSIDE_APP = ['/login', '/change-password', '/forgot-password', '/reset-password', '/verify-email', '/setup', '/create-super-admin', '/assessment/reports/print'];
  var root = document.documentElement;
  var stored = null;
  try { stored = window.localStorage.getItem('tdms.theme'); } catch (e) { /* private mode */ }
  var dark = stored === 'dark' || stored === 'light'
    ? stored === 'dark'
    : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var path = window.location.pathname;
  var outside = OUTSIDE_APP.some(function (p) { return path === p || path.indexOf(p + '/') === 0; });
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.shell = outside ? 'auth' : 'app';
})();
