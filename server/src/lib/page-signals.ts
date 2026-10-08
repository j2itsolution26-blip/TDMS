import { AuthorizationError, NotFoundError } from './http';

/**
 * Control flow for page loaders, as exceptions.
 *
 * A page loader (src/controllers/pages) decides, on the server, whether the
 * visitor may see a page at all. These end the loader early; the page route
 * turns them into a response the React app acts on — a redirect, a 404 or a
 * 403 — so the decision never moves to the browser.
 */

export class PageRedirect extends Error {
  constructor(readonly location: string) {
    super(`Redirect to ${location}`);
    this.name = 'PageRedirect';
  }
}

export function redirect(location: string): never {
  throw new PageRedirect(location);
}

export function notFound(): never {
  throw new NotFoundError();
}

export function forbidden(): never {
  throw new AuthorizationError();
}
