import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './ui/index.js';

/**
 * Catches render-time crashes and shows a recoverable panel instead of a white
 * screen.
 *
 * Wrapped per route rather than once around the app, so a crash in one module
 * leaves the sidebar, the top bar, and every other module usable — during a
 * live demo the difference between "one panel is broken" and "the product is
 * gone" is the whole impression.
 *
 * Note this catches *render* errors only. Failed requests never reach here:
 * React Query surfaces those as `isError` inside each page, which is why the
 * pages still carry their own retry affordances.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the stack reachable in the console for a post-mortem without
    // putting it on screen.
    console.error(`[ErrorBoundary${this.props.label ? ` · ${this.props.label}` : ''}]`, error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    const { children, label } = this.props;

    if (!error) return children;

    return (
      <div
        role="alert"
        className="flex min-h-[60vh] items-center justify-center p-6"
      >
        <div className="w-full max-w-md rounded-xl border border-rose-500/30 bg-slate-900/70 p-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/10">
            <AlertTriangle className="h-5 w-5 text-rose-300" aria-hidden="true" />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-slate-100">
            {label ? `${label} could not be displayed` : 'This panel could not be displayed'}
          </h2>

          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            Something went wrong while rendering this view. The rest of the
            application is unaffected — retry, or move to another module.
          </p>

          {error?.message ? (
            <p className="mt-3 truncate rounded-md bg-slate-950/60 px-2 py-1 font-mono text-[11px] text-slate-500">
              {error.message}
            </p>
          ) : null}

          <div className="mt-5 flex justify-center">
            <Button icon={RotateCw} onClick={this.handleRetry}>
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
