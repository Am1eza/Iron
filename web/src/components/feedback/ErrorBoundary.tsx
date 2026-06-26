'use client';
import { Component, type ReactNode } from 'react';
import { reportError } from '@/lib/errors/report';
import { ErrorState } from './ErrorState';

type Props = { children: ReactNode; fallback?: ReactNode; onReset?: () => void; label?: string };
type State = { hasError: boolean };

/**
 * Client error boundary — isolates a widget (ticker/chart/table) so a throw
 * there shows a scoped ErrorState and never blanks the whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    reportError(error, { source: 'ErrorBoundary', label: this.props.label });
  }

  private reset = () => {
    this.setState({ hasError: false });
    this.props.onReset?.();
  };

  override render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <ErrorState compact onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
