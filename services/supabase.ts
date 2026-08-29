import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO DO SUPABASE (Vite) ---
// Coloque suas chaves em .env.local (NÃO commitar; já está no .gitignore).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const EXPECTED_SUPABASE_REF = (import.meta.env.VITE_EXPECTED_SUPABASE_REF as string | undefined)?.trim();

const getProjectRef = (url?: string): string => {
  if (!url) return '';
  try {
    return new URL(url).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
};

const configuredProjectRef = getProjectRef(SUPABASE_URL);
const projectMatches = !EXPECTED_SUPABASE_REF || configuredProjectRef === EXPECTED_SUPABASE_REF;

export const supabaseConfig = {
  configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && projectMatches),
  projectRef: configuredProjectRef,
  expectedProjectRef: EXPECTED_SUPABASE_REF || '',
  projectMatches,
  missing: [
    !SUPABASE_URL ? 'VITE_SUPABASE_URL' : '',
    !SUPABASE_ANON_KEY ? 'VITE_SUPABASE_ANON_KEY' : '',
    !projectMatches ? 'VITE_SUPABASE_URL (projeto inesperado)' : ''
  ].filter(Boolean)
};

if (!supabaseConfig.configured) {
  // Não quebra o app no build, mas deixa claro o problema no console.
  console.warn(
    `[Supabase] Configuração ausente: ${supabaseConfig.missing.join(', ')}`
  );
}

// URLs vazias fazem createClient() lançar durante o import e deixam o app inteiro
// branco. O cliente inerte mantém o cache offline acessível e as chamadas remotas
// falham de forma diagnosticável quando uma build estiver sem configuração.
const SAFE_SUPABASE_URL = supabaseConfig.configured ? SUPABASE_URL! : 'http://127.0.0.1:54321';
const SAFE_SUPABASE_ANON_KEY = supabaseConfig.configured ? SUPABASE_ANON_KEY! : 'missing-anon-key';

export const supabase = createClient(SAFE_SUPABASE_URL, SAFE_SUPABASE_ANON_KEY);
