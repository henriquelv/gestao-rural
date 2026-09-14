-- Cache interno dos paineis gerados a partir da integracao Rúmina/Ideagri.
-- A API externa continua estritamente em modo de leitura. Esta tabela guarda
-- somente o resultado calculado pelo nosso aplicativo para evitar refazer as
-- consultas pesadas a cada inicializacao de uma funcao da Vercel.
create table if not exists public.rumina_dashboard_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists rumina_dashboard_cache_expires_at_idx
  on public.rumina_dashboard_cache (expires_at);

alter table public.rumina_dashboard_cache enable row level security;

-- O navegador usa a chave anon. Ele nunca deve ler o consolidado diretamente:
-- toda leitura passa pela funcao autenticada do aplicativo.
revoke all on table public.rumina_dashboard_cache from anon, authenticated;
grant select, insert, update, delete on table public.rumina_dashboard_cache to service_role;

comment on table public.rumina_dashboard_cache is
  'Cache somente leitura da integracao Rúmina/Ideagri, mantido pelas funcoes do app.';
