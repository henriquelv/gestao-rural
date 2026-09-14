-- Agenda de visitas da Campo Legado.
-- Aplicar somente no projeto gratuito TESTE autorizado (qkwgeahpctkjuqpamupi).
-- Migração idempotente, sem alteração nos registros de OS existentes.

create table if not exists public.appointments (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text not null,
  employee_name text not null,
  device_id text,
  "clientId" text,
  "clientName" text not null,
  date date not null,
  period text not null check (period in ('morning', 'afternoon')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  activity text not null default 'Visita técnica',
  "locationNote" text,
  notes text,
  "createdByEmployeeId" text,
  "createdByEmployeeName" text,
  "createdAt" timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_appointments_farm_date
  on public.appointments(farm_id, date);
create index if not exists idx_appointments_farm_employee_date
  on public.appointments(farm_id, employee_id, date);
create index if not exists idx_appointments_farm_client
  on public.appointments(farm_id, "clientName");
create index if not exists idx_appointments_updated_at
  on public.appointments(updated_at);

alter table public.appointments enable row level security;

drop policy if exists teste_select on public.appointments;
drop policy if exists teste_insert on public.appointments;
drop policy if exists teste_update on public.appointments;
drop policy if exists teste_delete on public.appointments;

create policy teste_select on public.appointments
  for select to anon, authenticated using (true);
create policy teste_insert on public.appointments
  for insert to anon, authenticated with check (true);
create policy teste_update on public.appointments
  for update to anon, authenticated using (true) with check (true);
create policy teste_delete on public.appointments
  for delete to anon, authenticated using (true);

grant select, insert, update, delete on public.appointments to anon, authenticated;
