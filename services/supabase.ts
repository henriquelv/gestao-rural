import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO DO SUPABASE (Vite) ---
// Coloque suas chaves em .env.local (NÃO commitar; já está no .gitignore).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// navigator.onLine pode continuar verdadeiro quando o sinal existe, mas a
// internet não responde. Sem limite, uma consulta pendurada mantinha telas e
// sincronizações abertas por tempo indefinido em campo.
const fetchWithTimeout = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const options = init || {};
  const controller = new AbortController();
  const method = String(options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const timeoutMs = method === 'GET' || method === 'HEAD' ? 15_000 : 45_000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const originalSignal = options.signal;
  const abortFromOriginal = () => controller.abort(originalSignal?.reason);
  if (originalSignal) {
    if (originalSignal.aborted) abortFromOriginal();
    else originalSignal.addEventListener('abort', abortFromOriginal, { once: true });
  }
  try {
    return await fetch(input, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    originalSignal?.removeEventListener('abort', abortFromOriginal);
  }
};

export const isSupabaseConfigured = Boolean(SUPABASE_URL?.trim() && SUPABASE_ANON_KEY?.trim());

if (!isSupabaseConfigured) {
  console.warn(
    '[Banco] Ambiente TESTE desconectado. Nenhuma credencial Supabase está ativa.'
  );
}

// O cliente inerte mantém os módulos compiláveis enquanto a base provisória não é escolhida.
// Nenhuma requisição é iniciada automaticamente quando isSupabaseConfigured=false.
export const supabase = createClient(
  isSupabaseConfigured ? SUPABASE_URL! : 'http://127.0.0.1:54321',
  isSupabaseConfigured ? SUPABASE_ANON_KEY! : 'ambiente-teste-desconectado',
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchWithTimeout }
  }
);
