# Migracao Multi-Fazenda

## Objetivo

Adicionar fazendas, licencas, dispositivos e `farm_id` sem perder dados antigos. O cliente atual vira a fazenda `Cliente Atual`.

## Ordem segura

1. Criar Supabase de teste `gestao-rural-test`.
2. Restaurar backup do banco atual.
3. Copiar bucket `media`.
4. Aplicar migrations em `supabase/migrations`.
5. Rodar app com `.env.test.local`.
6. Validar dados antigos, imagens, sync e ativacao.
7. Somente depois repetir em producao.

## Migrations

- `202605180001_baseline_current_schema.sql`: marco documental do estado atual.
- `202605180002_multi_fazenda_licencas.sql`: cria `farms`, `licenses`, `devices`, adiciona `farm_id` nullable e associa dados antigos a `Cliente Atual`.

## settings vs farm_settings

O SQL historico cria `farm_settings`, mas o app atual le/escreve `settings`. Nesta etapa nao renomeamos nem apagamos tabelas. A compatibilidade deve ser feita no codigo e a migration adiciona `farm_id` em ambas somente se existirem.

Correcao incremental recomendada depois da validacao:

1. Definir uma tabela canonica.
2. Copiar dados entre `settings` e `farm_settings`.
3. Ajustar app e docs.
4. Apenas em etapa futura, com backup, pensar em consolidacao.

## Compatibilidade

Durante a transicao, o app deve aceitar registros antigos sem `farm_id` e exibi-los junto da fazenda ativada.
