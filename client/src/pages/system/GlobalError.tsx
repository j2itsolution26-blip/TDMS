import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * The last line of defence: a screen threw while rendering.
 *
 * Nothing from the error is shown — only a generic message — and the detail
 * goes to the browser console for whoever is debugging. "Try again" renders
 * the tree again; "Back to dashboard" is a full navigation, which also
 * clears whatever state caused the failure.
 */
export default class GlobalError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[TDMS] Render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold text-navy-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">
          The page could not be displayed. Please try again, or contact an administrator if it keeps
          happening.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => this.setState({ failed: false })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    );
  }
}
