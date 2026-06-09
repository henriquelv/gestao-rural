# Offline e Midias

## Objetivo

Fotos, videos e documentos devem abrir offline quando foram criados no aparelho ou cacheados previamente.

## Ordem de resolucao

1. Arquivo local/cache.
2. URL remota se online.
3. Placeholder quando indisponivel.

## Paths

Novo padrao:

```text
farms/{farm_id}/{tableName}/{recordId}/{mediaId}.{ext}
```

Paths antigos continuam aceitos:

```text
anomalies/...
instructions/...
notices/...
improvements/...
farm_docs/...
```

## Cuidados

- Nao apagar midia local automaticamente apos upload.
- Cache remoto deve ser melhor esforco e nao bloquear sync de dados.
- Se Storage falhar, o registro local permanece no outbox para nova tentativa.
