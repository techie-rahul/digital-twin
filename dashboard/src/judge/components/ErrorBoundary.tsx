import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  label: string;
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

// Keeps one panel's render failure (e.g. an unexpected backend response shape)
// from blanking the whole page during a demo.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}] render failed:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs space-y-1.5">
          <div className="flex items-center gap-2 text-red-800 font-bold">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>{this.props.label} failed to render</span>
          </div>
          <p className="font-mono text-red-700 break-all">{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-2.5 py-1 rounded-md bg-white border border-red-200 text-red-800 font-mono font-semibold hover:bg-red-100 transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
