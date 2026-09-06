import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './ui/index.js';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
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
        className="flex min-h-[60vh] items-center justify-center p-6 text-primary"
      >
        <div className="w-full max-w-md rounded-[8px] border border-critical-border bg-surface p-6 text-center shadow-elevation">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-critical-border bg-critical-bg">
            <AlertTriangle className="h-5 w-5 text-critical-text" aria-hidden="true" />
          </div>

          <h2 className="mt-4 text-sm font-semibold text-heading">
            {label ? `${label} could not be displayed` : 'This panel could not be displayed'}
          </h2>

          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            Something went wrong while rendering this view. The rest of the
            application is unaffected — retry, or move to another module.
          </p>

          {error?.message ? (
            <p className="mt-3 truncate rounded-[4px] bg-subtle px-2 py-1 font-mono text-[11px] text-muted">
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
