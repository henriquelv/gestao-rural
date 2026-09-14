-- Preparação do período de testes da Campo Legado.
-- Aplicar somente no projeto gratuito TESTE autorizado: qkwgeahpctkjuqpamupi.

begin;

-- O dia todo ocupa as duas faixas da agenda, mas permanece um único registro.
alter table public.appointments
  drop constraint if exists appointments_period_check;
alter table public.appointments
  add constraint appointments_period_check
  check (period in ('morning', 'afternoon', 'full_day'));

-- Início do teste com OS e comunicados vazios. Agenda e demais cadastros são preservados.
delete from public.anomalies
where farm_id = 'ca4f1e9a-2026-4e57-8000-000000000001';

delete from public.notices
where farm_id = 'ca4f1e9a-2026-4e57-8000-000000000001';

insert into public.clients (farm_id, name, status)
values ('ca4f1e9a-2026-4e57-8000-000000000001', 'Campo Legado Consultoria', 'active')
on conflict (farm_id, name) do update set
  status = 'active',
  updated_at = now();

update public.employees
set role = 'Administrador',
    is_admin = true,
    admin_pin = coalesce(admin_pin, access_pin, '1234'),
    updated_at = now()
where farm_id = 'ca4f1e9a-2026-4e57-8000-000000000001'
  and id in ('tecnico-04', 'tecnico-05', 'tecnico-06', 'tecnico-07', 'tecnico-12');

insert into public.employees (
  id, farm_id, name, role, status, is_admin, admin_pin, access_pin
) values (
  'tecnico-14',
  'ca4f1e9a-2026-4e57-8000-000000000001',
  'Adriana',
  'Administrador',
  'active',
  true,
  '1234',
  '1234'
) on conflict (id) do update set
  farm_id = excluded.farm_id,
  name = excluded.name,
  role = excluded.role,
  status = excluded.status,
  is_admin = excluded.is_admin,
  admin_pin = coalesce(public.employees.admin_pin, excluded.admin_pin),
  access_pin = coalesce(public.employees.access_pin, excluded.access_pin),
  updated_at = now();

commit;
