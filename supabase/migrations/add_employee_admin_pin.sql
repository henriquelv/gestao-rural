-- ============================================================
-- Migração: Adicionar suporte a admin por funcionário
-- Executar no Supabase SQL Editor
-- ============================================================

-- 1. Adicionar colunas na tabela employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_pin TEXT;

-- ============================================================
-- 2. Adicionar SANDRO como admin na fazenda Starmilk
-- ============================================================
-- PASSO A: Descobrir o farm_id da Starmilk:
--   SELECT id, name, activation_code FROM farms WHERE activation_code = 'STARMILK';
--
-- PASSO B: Verificar se SANDRO já existe:
--   SELECT id, name, farm_id FROM employees WHERE name = 'SANDRO';
--
-- PASSO C: Se SANDRO já existe, apenas atualizar:
UPDATE employees
SET
  is_admin = true,
  admin_pin = '1234',
  role = 'Administrador'
WHERE
  name = 'SANDRO'
  AND farm_id = (SELECT id FROM farms WHERE activation_code = 'STARMILK' LIMIT 1);
--
-- PASSO D: Se SANDRO NÃO existe, inserir:
-- INSERT INTO employees (id, farm_id, name, role, is_admin, admin_pin, status)
-- SELECT
--   gen_random_uuid(),
--   f.id,
--   'SANDRO',
--   'Administrador',
--   true,
--   '1234',
--   'active'
-- FROM farms f
-- WHERE f.activation_code = 'STARMILK'
-- LIMIT 1;

-- ============================================================
-- 3. Verificação (rodar após a migração)
-- ============================================================
-- SELECT e.name, e.role, e.is_admin, e.admin_pin, f.name as fazenda
-- FROM employees e
-- JOIN farms f ON f.id = e.farm_id
-- WHERE e.is_admin = true
-- ORDER BY f.name, e.name;
