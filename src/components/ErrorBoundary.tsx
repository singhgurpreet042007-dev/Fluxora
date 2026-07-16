import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Centralized place to wire up error reporting later (Sentry, etc.)
    console.error('Fluxora crashed:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-primary)]">
        <div className="glass-strong rounded-3xl p-8 max-w-md text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/15 flex items-center justify-center mb-4">
            <AlertTriangle className="text-rose-400" size={26} />
          </div>
          <h1 className="text-xl font-bold text-white font-display mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            Fluxora hit an unexpected error. Your data is safe — reloading usually fixes this.
          </p>
          <button
            onClick={this.handleReload}
            className="btn-primary rounded-xl px-5 py-2.5 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw size={15} /> Reload Fluxora
          </button>
        </div>
      </div>
    );
  }
}
