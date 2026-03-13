import React from 'react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

const clearAppStorage = () => {
  if (typeof window === 'undefined') return;
  try {
    const keysToDelete: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith('dr_dyrane') || key.startsWith('dr-dyrane')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage clear failures and still reload.
  }
};

export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('App render error:', error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetAndReload = () => {
    clearAppStorage();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-surface-primary text-content-primary flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[360px] surface-raised rounded-[28px] p-5 shadow-glass space-y-4">
          <div className="space-y-2">
            <h1 className="text-base font-semibold tracking-tight text-content-primary">
              Something interrupted the consultation
            </h1>
            <p className="text-sm leading-relaxed text-content-secondary">
              Reload to continue. If this repeats, reset local session data and reopen the app.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="h-11 rounded-2xl cta-live text-sm font-semibold focus-glow interactive-tap"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="h-11 rounded-2xl surface-strong text-sm font-semibold text-content-secondary focus-glow interactive-tap"
            >
              Reset local session and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
