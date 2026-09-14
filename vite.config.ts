import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const offlineServiceWorker = () => ({
  name: 'campo-legado-offline-service-worker',
  generateBundle(_: unknown, bundle: Record<string, unknown>) {
    const deferredExportChunk = /(exceljs|jspdf|html2canvas|purify|index\.es-)/i;
    const generatedFiles = Object.entries(bundle)
      // Bibliotecas de Excel/PDF/Word são carregadas somente quando o usuário
      // exporta. Pré-baixá-las no primeiro acesso transferia mais de 2 MB e
      // competia com a sincronização e com a API dos indicadores.
      .filter(([file, output]: [string, any]) => !deferredExportChunk.test(file)
        && (!('code' in output) || output.code.length < 300_000))
      .map(([file]) => file)
      .filter((file) => !file.includes('localdb.native'));
    const files = Array.from(new Set([
      '/',
      '/index.html',
      '/manifest.webmanifest',
      '/icons/campo-legado-v2-192.png',
      '/icons/campo-legado-v2-512.png',
      '/brand/campo-legado-logo-v2.png',
      // O banco SQLite é exclusivo do APK. Não fazê-lo baixar no navegador reduz
      // o custo da instalação PWA sem afetar o modo offline da versão web.
      ...generatedFiles.map((file) => `/${file}`)
    ]));
    const cacheName = `campo-legado-teste-${Date.now()}`;
    const source = `
const CACHE_NAME = ${JSON.stringify(cacheName)};
const APP_SHELL = ${JSON.stringify(files)};

const cacheAppShell = async () => {
  const cache = await caches.open(CACHE_NAME);
  // Poucas transferências simultâneas evitam saturar a conexão móvel. Uma rota
  // opcional indisponível não deve impedir a instalação de todo o modo offline.
  for (let index = 0; index < APP_SHELL.length; index += 6) {
    const batch = APP_SHELL.slice(index, index + 6);
    await Promise.all(batch.map((url) => cache.add(url).catch(() => undefined)));
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Mantém a versão imediatamente anterior enquanto abas antigas terminam de
      // atualizar. Assim uma troca de versão não apaga os chunks que elas usam.
      .then((keys) => {
        const appCaches = keys.filter((key) => key.startsWith('campo-legado-teste-')).sort().reverse();
        return Promise.all(appCaches.slice(2).map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Respostas protegidas do BI nunca entram no Cache Storage compartilhado.
  // O aplicativo mantém apenas o último painel agregado no armazenamento local
  // e somente a tela com proteção administrativa consegue lê-lo.
  if (url.pathname.startsWith('/api/rumina/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === 'navigate') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    event.respondWith(
      fetch(request, { signal: controller.signal })
        .then((response) => {
          clearTimeout(timeout);
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => {
          clearTimeout(timeout);
          return caches.match('/index.html').then((cached) => cached || caches.match('/'));
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }))
  );
});
`;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source });
  }
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), offlineServiceWorker()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        assetsInclude: ['**/*.pdf'],
        copyPublicDir: true,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('react-dom') || id.includes('react-router-dom') || /node_modules[\\/]react[\\/]/.test(id)) return 'vendor-react';
              if (id.includes('@supabase')) return 'vendor-supabase';
              if (id.includes('dexie')) return 'vendor-storage';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (id.includes('@capacitor')) return 'vendor-capacitor';
              return undefined;
            }
          }
        }
      }
    };
});
