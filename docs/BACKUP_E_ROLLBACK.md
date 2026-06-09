# Backup e Rollback

Este projeto nao deve receber migration em producao sem backup do banco e do bucket `media`.

## Backup do banco

Crie uma pasta datada:

```powershell
mkdir backups\YYYY-MM-DD-prod
```

Exporte:

```powershell
supabase db dump --db-url "CONNECTION_STRING_PROD" -f backups\YYYY-MM-DD-prod\roles.sql --role-only
supabase db dump --db-url "CONNECTION_STRING_PROD" -f backups\YYYY-MM-DD-prod\schema.sql
supabase db dump --db-url "CONNECTION_STRING_PROD" -f backups\YYYY-MM-DD-prod\data.sql --use-copy --data-only
```

## Backup do Storage/media

O backup do banco nao salva os arquivos do Supabase Storage. Ele salva apenas dados/metadados.

Opcoes:

- Dashboard: Storage > bucket `media` > baixar os objetos mantendo os paths.
- S3/rclone/AWS CLI: recomendado se houver muitas imagens/videos.

Preserve paths antigos como `anomalies/...`, `instructions/...`, `notices/...`, `improvements/...` e `farm_docs/...`.

## Rollback

Se a falha for no app, volte o build anterior.

Se a falha for no banco:

1. Pare novas sincronizacoes.
2. Restaure em um projeto limpo ou use PITR se disponivel.
3. Reimporte `roles.sql`, `schema.sql` e `data.sql`.
4. Reenvie o bucket `media`.
5. Aponte o app para o projeto restaurado.

Nunca use `DROP`, `TRUNCATE` ou limpeza manual sem um restore validado.
