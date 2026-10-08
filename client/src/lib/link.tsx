import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { Link as RouterLink } from 'react-router-dom';

/**
 * An in-app link. Routes inside the React app navigate without a reload;
 * anything else — the API (file downloads, OAuth), other sites, mailto: —
 * is an ordinary anchor, so the router never swallows it.
 */
export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  replace?: boolean;
}

function isAppRoute(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, replace, ...rest }, ref) {
  if (!isAppRoute(href)) return <a ref={ref} href={href} {...rest} />;
  return <RouterLink ref={ref} to={href} replace={replace} {...rest} />;
});

export default Link;
