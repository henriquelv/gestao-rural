import React from 'react';

interface State {
  error: Error | null;
}

const RETRY_KEY = 'campo_legado_app_recovery_v1';

const refreshApplication = async (): Promise<void> => {
  try {
    const registrations = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map((registration) => registration.update().catch(() => undefined)));
  } catch {
    // A atualização manual continua válida mesmo se o navegador não expuser o SW.
  }
  window.location.reload();
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    try {
      localStorage.setItem('last_runtime_error', JSON.stringify({
        at: new Date().toISOString(),
        payload: JSON.stringify({ type: 'render', message: error.message, stack: error.stack, componentStack: info.componentStack })
      }));
    } catch {
      // O diagnóstico é opcional e nunca deve impedir a recuperação da tela.
    }

    const isStaleChunk = /dynamically imported|loading chunk|chunkloaderror|importing a module script/i.test(error.message);
    if (!isStaleChunk) return;
    try {
      if (sessionStorage.getItem(RETRY_KEY)) return;
      sessionStorage.setItem(RETRY_KEY, '1');
      void refreshApplication();
    } catch {
      // Se sessionStorage estiver bloqueado, exibe os controles abaixo.
    }
  }

  private goHome = (): void => {
    window.location.hash = '#/';
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f4f0e7] px-5 text-[#173f32]">
        <section className="w-full max-w-sm rounded-[24px] border border-[#d8d0c2] bg-white p-6 text-center shadow-xl" role="alert">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#718078]">Não foi possível abrir esta tela</p>
          <h1 className="campo-display mt-2 text-2xl">Vamos atualizar o aplicativo</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#617068]">Seus registros salvos no aparelho serão mantidos.</p>
          <button type="button" onClick={() => void refreshApplication()} className="mt-5 min-h-12 w-full rounded-xl bg-[#173f32] px-4 text-sm font-black text-white">Atualizar agora</button>
          <button type="button" onClick={this.goHome} className="mt-2 min-h-11 w-full rounded-xl border border-[#c9d2c6] px-4 text-sm font-black">Voltar ao início</button>
        </section>
      </main>
    );
  }
}
