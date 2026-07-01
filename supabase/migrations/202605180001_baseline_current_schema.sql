-- Baseline documental do schema atual.
--
-- Esta migration NAO recria tabelas em producao e nao deve ser aplicada sem
-- restaurar antes em um Supabase de teste. O estado historico completo esta em:
--   supabase_setup.sql
--
-- Mantemos este arquivo como marco versionado para que as migrations seguintes
-- sejam incrementais e auditaveis.

do $$
begin
  raise notice 'Baseline documental. Ver supabase_setup.sql para o schema atual.';
end $$;
