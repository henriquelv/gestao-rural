-- Compatibilidade para bancos que tenham a tabela public.settings separada.
--
-- O schema historico usa farm_settings, mas algumas versoes do app gravam
-- settings localmente e podem sincronizar para uma tabela settings se ela existir.
-- Esta migration nao cria a tabela, nao apaga dados e nao altera colunas.

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.settings') is null then
    raise notice 'Tabela public.settings nao existe; nada a ajustar.';
    return;
  end if;

  select conname
    into constraint_name
    from pg_constraint
   where conrelid = 'public.settings'::regclass
     and contype = 'p'
   limit 1;

  if constraint_name is not null then
    execute format('alter table public.settings drop constraint %I', constraint_name);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.settings'::regclass
       and conname = 'settings_farm_id_id_key'
  ) then
    alter table public.settings
      add constraint settings_farm_id_id_key unique (farm_id, id);
  end if;
end $$;

notify pgrst, 'reload schema';
