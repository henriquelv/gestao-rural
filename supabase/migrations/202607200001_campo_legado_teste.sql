-- Campo Legado Consultoria - ambiente gratuito TESTE
-- Projeto autorizado: qkwgeahpctkjuqpamupi
-- Migration idempotente e sem operacoes destrutivas.

create extension if not exists "pgcrypto";

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  activation_code text not null unique,
  max_devices integer not null default 100,
  grace_period_days integer not null default 30,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  role text not null default 'Técnico',
  status text not null default 'active',
  "photoUri" text,
  is_admin boolean not null default false,
  admin_pin text,
  access_pin text not null default '1234',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_employees_farm_id on public.employees(farm_id);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text not null references public.employees(id),
  device_id text not null,
  device_name text,
  platform text,
  status text not null default 'active',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(farm_id, device_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(farm_id, name)
);

create table if not exists public.anomalies (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text,
  employee_name text,
  device_id text,
  "createdByEmployeeId" text,
  "createdByEmployeeName" text,
  "technicianId" text,
  "recordType" text not null default 'service_order',
  "createdAt" timestamptz not null,
  "serviceDate" date,
  "clientName" text,
  "serviceOrderType" text check ("serviceOrderType" is null or "serviceOrderType" in ('receita', 'despesa')),
  "projectValue" numeric(14,2) not null default 0,
  "visitValue" numeric(14,2) not null default 0,
  "kmQuantity" numeric(12,2) not null default 0,
  "kmUnitValue" numeric(14,2) not null default 0,
  "kmValue" numeric(14,2) not null default 0,
  "paymentStatus" text check ("paymentStatus" is null or "paymentStatus" in ('a_receber', 'recebido')),
  location jsonb,
  responsible text not null,
  sector text not null default 'Ordem de Serviço',
  description text not null default '',
  "immediateSolution" text not null default '',
  media jsonb not null default '[]'::jsonb,
  "resolvedAt" timestamptz,
  "resolvedBy" text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_anomalies_farm_created on public.anomalies(farm_id, "createdAt" desc);
create index if not exists idx_anomalies_farm_technician on public.anomalies(farm_id, "technicianId");
create index if not exists idx_anomalies_farm_creator on public.anomalies(farm_id, employee_id);
create index if not exists idx_anomalies_farm_client on public.anomalies(farm_id, "clientName");

create table if not exists public.notices (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text,
  employee_name text,
  device_id text,
  "createdAt" timestamptz not null,
  responsible text not null,
  content text not null,
  media jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists idx_notices_farm_created on public.notices(farm_id, "createdAt" desc);

create table if not exists public.instructions (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text,
  employee_name text,
  device_id text,
  "createdAt" timestamptz not null,
  title text not null,
  sector text not null,
  description text not null,
  media jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.improvements (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text,
  employee_name text,
  device_id text,
  "createdAt" timestamptz not null,
  employee text not null,
  sector text not null,
  description text not null,
  media jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_docs (
  id text primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  employee_id text,
  employee_name text,
  device_id text,
  "updatedAt" timestamptz not null,
  title text not null,
  sector text not null,
  responsible text,
  media jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sectors (
  id bigserial primary key,
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  unique(farm_id, name)
);

create table if not exists public.ui_config (
  farm_id uuid not null references public.farms(id) on delete cascade,
  id bigint not null default 1,
  buttons jsonb not null default '[]'::jsonb,
  "customPages" jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(farm_id, id)
);

create table if not exists public.farm_settings (
  farm_id uuid not null references public.farms(id) on delete cascade,
  id bigint not null default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(farm_id, id)
);

create table if not exists public.milk_daily (
  farm_id uuid not null references public.farms(id) on delete cascade,
  date date not null,
  liters numeric not null,
  employee_id text,
  employee_name text,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key(farm_id, date)
);

create table if not exists public.daily_metrics (
  farm_id uuid not null references public.farms(id) on delete cascade,
  date date not null,
  type text not null check (type in ('lactation', 'discard', 'births')),
  value numeric not null,
  employee_id text,
  employee_name text,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key(farm_id, date, type)
);

create table if not exists public.farm_monthly_stats (
  farm_id uuid not null references public.farms(id) on delete cascade,
  "monthKey" text not null,
  "lactatingCows" integer not null,
  "discardedCows" integer not null,
  births integer not null,
  employee_id text,
  employee_name text,
  device_id text,
  updated_at timestamptz not null default now(),
  primary key(farm_id, "monthKey")
);

-- O app e offline-first e usa a role anon durante o teste interno de 15 dias.
-- O projeto e exclusivo da Campo Legado e sera endurecido ao migrar para Pro/Auth.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'farms', 'licenses', 'employees', 'devices', 'clients', 'anomalies',
    'notices', 'instructions', 'improvements', 'farm_docs', 'sectors',
    'ui_config', 'farm_settings', 'milk_daily', 'daily_metrics', 'farm_monthly_stats'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists teste_select on public.%I', table_name);
    execute format('drop policy if exists teste_insert on public.%I', table_name);
    execute format('drop policy if exists teste_update on public.%I', table_name);
    execute format('drop policy if exists teste_delete on public.%I', table_name);
    execute format('create policy teste_select on public.%I for select to anon, authenticated using (true)', table_name);
    execute format('create policy teste_insert on public.%I for insert to anon, authenticated with check (true)', table_name);
    execute format('create policy teste_update on public.%I for update to anon, authenticated using (true) with check (true)', table_name);
    execute format('create policy teste_delete on public.%I for delete to anon, authenticated using (true)', table_name);
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 12582912)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

drop policy if exists campo_legado_media_select on storage.objects;
drop policy if exists campo_legado_media_insert on storage.objects;
drop policy if exists campo_legado_media_update on storage.objects;
drop policy if exists campo_legado_media_delete on storage.objects;
create policy campo_legado_media_select on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy campo_legado_media_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');
create policy campo_legado_media_update on storage.objects for update to anon, authenticated using (bucket_id = 'media') with check (bucket_id = 'media');
create policy campo_legado_media_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'media');

insert into public.farms (
  id, name, status, activation_code, max_devices, grace_period_days
) values (
  'ca4f1e9a-2026-4e57-8000-000000000001',
  'Campo Legado Consultoria',
  'active',
  'TESTE',
  100,
  30
) on conflict (activation_code) do update set
  name = excluded.name,
  status = excluded.status,
  max_devices = excluded.max_devices,
  grace_period_days = excluded.grace_period_days,
  updated_at = now();

insert into public.licenses (id, farm_id, status, notes)
values (
  'ca4f1e9a-2026-4e57-8000-000000000002',
  'ca4f1e9a-2026-4e57-8000-000000000001',
  'active',
  'Ambiente gratuito TESTE por 15 dias.'
) on conflict (id) do update set status = 'active', updated_at = now();

insert into public.employees (id, farm_id, name, role, status, is_admin, admin_pin, access_pin) values
  ('administrador-campo-legado', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Administrador', 'Administrador', 'active', true, '1234', '1234'),
  ('tecnico-01', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Ana Victória Freitas Ribeiro', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-02', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Camila Pedro', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-03', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Debora Maria Barbosa Prado', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-04', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Gabriel De Sousa Vilela', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-05', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Gabriel Franco Rodrigues de Oliveira', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-06', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Guilherme Fontes', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-07', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Henrique Rodrigues Gomes Pereira', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-08', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Leonardo Rezende Guimarães', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-09', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Mateus Bogaz de Angelo', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-10', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Matheus Augusto Ferreira Fernandes', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-11', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Paulo Fernando Duarte Fernandes', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-12', 'ca4f1e9a-2026-4e57-8000-000000000001', 'Ricardo Nascimento Fernandes Vieira', 'Técnico', 'active', false, null, '1234'),
  ('tecnico-13', 'ca4f1e9a-2026-4e57-8000-000000000001', 'William França Resende Cunha', 'Técnico', 'active', false, null, '1234')
on conflict (id) do update set
  farm_id = excluded.farm_id,
  name = excluded.name,
  role = excluded.role,
  status = excluded.status,
  is_admin = excluded.is_admin,
  admin_pin = excluded.admin_pin,
  access_pin = excluded.access_pin,
  updated_at = now();

insert into public.clients (farm_id, name) values
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Acir Braga Coelho'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Adailson Alves de Almeida'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Adão Francisco dos Santos'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Agropecuária Cenci - Lago Verde'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Agropecuária Cenci'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Agropecuária Funchal'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Alfredo Vilela Junqueira Neto'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Anizeu Nunes'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Ary Silverio Xavier'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Cacildo Afonso Vieira'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Carlos Ipojucan Hollmann'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Carlos Sergio Nunes'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Claudio Henrique de Oliveira Barbosa Vieira'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Cristiano Humberto Ribeiro Fontes'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Daniel Bruno de Mendonça'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Daniella Martins da Silva'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Danilo Moreira'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Diogo Cantarelli Guimaraes'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Diola Agronegocios Ltda'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Euclides Rodrigues de Resende Neto'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Frederico Resende Franco'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Gilson Andre da Silva'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Giovanne Vicente de Souza'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Guilherme Correa de Moraes Sarmento'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Integral Agroindustrial'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Jan Hendrik Boerman'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Jander Guimarães Xavier'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Johann Friedrich Volker Karl Joeris Schicht - cria e fiv'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Johann Friedrich Volker Karl Joeris Schicht'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'José Arnoldo Caixeta'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'José Eduardo Alves Gouveia'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'José Gouveia Franco Neto'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'José Nazareno Freitas Bahia'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'José Paula'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Jose Ronaldo Lopes - Confinamento'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Jose Ronaldo Lopes'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Juliano Douglas Tizzo'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Juvenal Pinto Rocha'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Lucas Fernandes Santana e Outros'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Luiz Eduardo Branquinho'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Luiz Eugenio da Fonseca'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Luiz Humberto Gonçalves Reis'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Patrícia Franco Cunha'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Paulo Henrique Braga Machado'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Rafael Bali Moreira'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Rodrigo Lemos de Moraes Sarmento'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Samuel Toleto You Hsin Ma'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Silas Antonio Peres'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Volmar Pereira Caixeta'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Jose Nazareno de Freitas Bahia')
on conflict (farm_id, name) do update set status = 'active', updated_at = now();

insert into public.sectors (farm_id, name) values
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Ordem de Serviço'),
  ('ca4f1e9a-2026-4e57-8000-000000000001', 'Comunicados')
on conflict (farm_id, name) do nothing;

insert into public.farm_settings (farm_id, id, data) values (
  'ca4f1e9a-2026-4e57-8000-000000000001',
  1,
  '{"farmName":"CAMPO LEGADO CONSULTORIA","ownerName":"Campo Legado Consultoria","headerTextColor":"#143f32"}'::jsonb
) on conflict (farm_id, id) do update set data = excluded.data, updated_at = now();

insert into public.ui_config (farm_id, id, buttons, "customPages") values (
  'ca4f1e9a-2026-4e57-8000-000000000001', 1, '[]'::jsonb, '[]'::jsonb
) on conflict (farm_id, id) do nothing;

notify pgrst, 'reload schema';
