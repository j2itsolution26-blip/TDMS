/**
 * A page loader: everything a screen needs, decided on the server.
 *
 * Each one is the server half of a React page in client/src/pages. It
 * resolves the session, runs the page's policy, and returns the props the
 * screen renders. It ends early with redirect(), notFound() or forbidden()
 * from src/lib/page-signals, or by letting requireUser()/authorizePage()
 * throw — the browser never decides who may see a page.
 */
export interface PageRequest {
  /** Path parameters, e.g. { id } for /students/:id/enrollment. */
  params: Record<string, string>;
  /** Query string, single values. */
  query: Record<string, string | undefined>;
}

export type PageLoader<P = unknown> = (request: PageRequest) => Promise<P>;
