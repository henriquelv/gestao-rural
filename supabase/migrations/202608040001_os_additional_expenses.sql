-- Campos adicionados ao formulário de OS de despesa.
-- Mantidos com valores padrão para preservar compatibilidade com registros antigos.
alter table public.anomalies
  add column if not exists "additionalExpenseValue" numeric(14, 2) not null default 0,
  add column if not exists "additionalExpenseDescription" text not null default '';

