# Gestao Rural - App de Gestao de Fazenda Leiteira

## O que e este app

App mobile (Android via Capacitor) para gestao operacional de fazenda leiteira.
Usado diariamente por funcionarios no campo, muitas vezes sem internet.
Focado em registro de dados, anomalias, instrucoes de trabalho e comunicados.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Mobile**: Capacitor 5 (gera APK Android a partir do web app)
- **Backend**: Supabase (PostgreSQL + Storage + Auth) - plano Pro
- **DB local (web)**: Dexie.js (IndexedDB) - `FarmDB_Web_v3`
- **DB local (nativo)**: SQLite via `@capacitor-community/sqlite` - `FarmDB_Native_v1`
- **Roteamento**: React Router 6 (HashRouter)

## Arquitetura de dados (offline-first)

O app funciona offline-first com sincronizacao via outbox pattern:

1. **Escrita**: sempre grava no banco local primeiro (synced=false) + adiciona ao outbox
2. **Sync**: processa outbox → envia para Supabase → marca synced=true
3. **Leitura**: le do banco local; refreshFromServer() puxa delta do servidor
4. **Midia**: imagens comprimidas (max 1280px, JPEG 75%), armazenadas no Supabase Storage
5. **Cache offline**: midias remotas sao baixadas e cacheadas localmente ao abrir o app

### Arquivos-chave de dados

- `services/db.service.ts` — CRUD principal, refreshFromServer, smartRead/smartWrite
- `services/sync.service.ts` — processamento do outbox, upload de midia, retry
- `services/localdb.ts` — abstrai web (Dexie) vs nativo (SQLite)
- `services/localdb.web.ts` — schema Dexie com 12 tabelas + outbox + media_blobs
- `services/localdb.native.ts` — SQLite com kv_store + outbox
- `services/media.service.ts` — compressao, upload, cache offline, fallback remoto
- `services/supabase.ts` — client Supabase (chaves em .env.local)

### Tabelas com midia (Supabase Storage bucket "media")

anomalies, instructions, notices, improvements, farm_docs

### Tabelas so de numeros (sem midia)

daily_metrics (lactation/discard/births), milk_daily, farm_monthly_stats

## Telas principais

- `/` — Home com botoes configuraveis (UIConfig)
- `/anomalies/*` — Registro e lista de anomalias por setor
- `/instructions/*` — Instrucoes de trabalho por setor (PIN protegido)
- `/notices/*` — Comunicados
- `/improvements/*` — Melhorias
- `/data/*` — Dados fazenda: leite diario, vacas em lactacao, descartes, nascimentos
- `/norms/*` — Normas e organizacao (PIN protegido)
- `/settings` — Configuracoes (PIN protegido)

## Sync cycle (App.tsx)

1. `recoverOrphanedRecords()` — re-enfileira registros synced=false sem outbox
2. `refreshFromServer()` — puxa dados de todas as 12 tabelas
3. `syncPendingData()` — envia outbox para Supabase
4. `preCacheAllMedia()` — baixa midias remotas para cache offline (roda separado)

Intervalos: 1 minuto (se online) + 15 minutos (background) + ao reconectar internet

## Decisoes importantes

- **daily_metrics, milk_daily, farm_monthly_stats**: sempre fazem fetch completo (sem delta sync). O campo `date` e chave de negocio, nao timestamp de modificacao.
- **Ghost cleanup**: roda em toda sync dessas tabelas para remover registros deletados no servidor
- **Compressao de fotos**: max 1280px, JPEG 75% — uma foto de 5MB vira ~300KB
- **Videos**: limite de 40MB, sem compressao
- **PIN**: protege instrucoes, normas, configuracoes e edicao/exclusao de dados
- **Cache de midia offline**: roda 1x por sessao apos sync, com timeout de 30s por item

## Build e deploy

```bash
npm run build        # tsc + vite build
npx cap sync         # copia dist/ para android/
# Abrir Android Studio -> Build -> Generate Signed APK
```

## Variaveis de ambiente (.env.local)

```
VITE_SUPABASE_URL=https://lviwvkvkeyzqdcbevaih.supabase.co
VITE_SUPABASE_ANON_KEY=<chave>
```
