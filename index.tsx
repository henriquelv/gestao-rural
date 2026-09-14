import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async () => {
        await navigator.serviceWorker.ready;
        if (navigator.storage?.persist) {
          await navigator.storage.persist().catch(() => false);
        }
      })
      .catch((error) => console.warn('Modo offline não pôde ser ativado:', error));
  });
}

window.setTimeout(() => {
  try { sessionStorage.removeItem('campo_legado_app_recovery_v1'); } catch { /* armazenamento opcional */ }
}, 10_000);
