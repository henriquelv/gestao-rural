import { createClient } from '@supabase/supabase-js';

// --- CONFIGURAÇÃO DO SUPABASE (Vite) ---
// Coloque suas chaves em .env.local (NÃO commitar; já está no .gitignore).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Não quebra o app no build, mas deixa claro o problema no console.
  console.warn(
    '[Supabase] Variáveis de ambiente ausentes. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local'
  );
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '');
