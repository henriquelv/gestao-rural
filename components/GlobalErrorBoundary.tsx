import React from 'react';

type ErrorBoundaryState = {
  error: Error | null;
};

export class GlobalErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      localStorage.setItem('last_runtime_error', JSON.stringify({
        timestamp: new Date().toISOString(),
        message: error.message || String(error),
        stack: error.stack || '',
        componentStack: info.componentStack || '',
        route: window.location.hash || '/',
        appVersion: import.meta.env.VITE_APP_VERSION || 'unknown'
      }));
    } catch {
      // O boundary não pode falhar por erro de armazenamento.
    }
  }

  retry = () => {
    this.setState({ error: null });
  };

  copyDiagnostic = async () => {
    const error = this.state.error;
    const text = JSON.stringify({
      message: error?.message || 'Erro de renderização',
      stack: error?.stack || '',
      route: window.location.hash || '/',
      timestamp: new Date().toISOString()
    }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Copiar é opcional e não deve ocultar a mensagem principal.
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-100 p-6 flex items-center justify-center">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-black text-gray-900">Não foi possível carregar esta tela.</h1>
          <p className="mt-3 text-sm font-semibold text-gray-600">O dado não foi apagado.</p>
          <div className="mt-6 grid grid-cols-1 gap-3">
            <button onClick={() => window.history.back()} className="rounded-lg bg-gray-200 px-4 py-3 font-bold text-gray-800">
              Voltar
            </button>
            <button onClick={this.retry} className="rounded-lg bg-blue-600 px-4 py-3 font-bold text-white">
              Tentar novamente
            </button>
            <button onClick={this.copyDiagnostic} className="rounded-lg border border-gray-300 px-4 py-3 font-bold text-gray-800">
              Copiar diagnóstico
            </button>
          </div>
        </div>
      </div>
    );
  }
}