-- O aplicativo utiliza somente Técnico e Administrador.
-- Perfis intermediários criados durante os testes voltam a ser Técnicos.

update public.employees
set
  role = 'Técnico',
  is_admin = false,
  admin_pin = null,
  updated_at = now()
where lower(trim(role)) in ('sócio', 'socio', 'administrativo');

update public.employees
set
  role = 'Administrador',
  is_admin = true,
  admin_pin = coalesce(admin_pin, access_pin),
  updated_at = now()
where lower(trim(role)) = 'administrador';
