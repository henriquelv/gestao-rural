-- Suporte seguro a administrador por funcionario.
--
-- Regras:
-- - Nao usa DROP, TRUNCATE ou DELETE.
-- - Nao torna campos NOT NULL.
-- - Nao recria employees.
-- - Apenas adiciona colunas opcionais e marca/cria SANDRO como admin da STARMILK.

alter table public.employees
  add column if not exists is_admin boolean default false,
  add column if not exists admin_pin text;

do $$
declare
  starmilk_farm_id uuid;
  sandro_count integer;
begin
  select id
    into starmilk_farm_id
    from public.farms
   where upper(activation_code) = 'STARMILK'
   limit 1;

  if starmilk_farm_id is null then
    raise notice 'Fazenda STARMILK nao encontrada; colunas criadas, admin nao atualizado.';
    return;
  end if;

  update public.employees
     set is_admin = true,
         admin_pin = coalesce(admin_pin, '1234'),
         role = 'Administrador',
         status = coalesce(status, 'active'),
         updated_at = now()
   where upper(name) = 'SANDRO'
     and farm_id = starmilk_farm_id;

  get diagnostics sandro_count = row_count;

  if sandro_count = 0 then
    insert into public.employees (
      id,
      farm_id,
      name,
      role,
      status,
      is_admin,
      admin_pin,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid()::text,
      starmilk_farm_id,
      'SANDRO',
      'Administrador',
      'active',
      true,
      '1234',
      now(),
      now()
    );
  end if;
end $$;

-- Garante que a API REST enxergue as colunas novas sem esperar cache expirar.
notify pgrst, 'reload schema';
