# PLANO DE AÇÃO — GESTÃO RURAL
## Documentação Técnica de Correção e Evolução do App

> **Para quem lê este arquivo:** Este é o guia mestre do projeto. Qualquer programador que abra este repositório deve começar aqui para entender o estado atual, o que já foi corrigido, o que ainda falta e como fazer cada correção. Atualizar este arquivo a cada entrega é obrigatório.
>
> **Legenda de status:** ✅ Concluído | ⏳ Pendente | 🔄 Parcialmente feito | ❌ Bloqueado

---

## ATUALIZAÇÃO DE 2026-08-29 — AUDITORIA DEFINITIVA 1.0.15

**Branch:** `fix/auditoria-estabilidade-sync-v2`
**Versão Android:** `1.0.15-definitive-audit-hotfix` (`versionCode 16`)
**Supabase esperado:** `vocnftkhnrfnbfvpnqtb`

Auditoria completa registrada em `docs/AUDITORIA_DEFINITIVA_2026-08-29.md`.

Principais correções desta rodada:

- removido fallback fixo de funcionários, evitando nomes de outra fazenda/cache incorreto;
- URLs de mídia agora são sempre reconstruídas pelo `remotePath` no Supabase atual;
- menu/configuração padrão abre imediatamente sem depender da rede;
- seed opcional não exclui mais instruções;
- edição de métricas rejeita valores negativos;
- Project Ref esperado é validado antes de criar o cliente Supabase;
- lockfile atualizado para remover dependências transitivas com alertas altos.
- Home renderiza o menu padrão antes da ponte SQLite e não fica presa em `Preparando o menu` offline;
- recuperação de órfãos cobre somente dados operacionais e não cria outbox artificial para seeds antigos.

Auditoria remota somente leitura: 888 anomalias, 245 dias de leite, 430 métricas diárias e 48 funcionários ativos. Das 406 mídias referenciadas, 400 existem e 6 paths legados estão ausentes. Nenhuma alteração foi aplicada ao Supabase.

Validação final: lint, 43 testes, build, Capacitor sync, Gradle e smoke local com 650 anomalias aprovados. APK em `builds/definitive-audit-hotfix/gestao-rural-1.0.15-definitive-audit-hotfix-debug.apk`, SHA-256 `FA0D1F184B41ACB5EAC0CB3A83228B2C06B231500A40BE53C6BAD12CC8B95FAB`, com a mesma assinatura das versões anteriores.

---

## ATUALIZAÇÃO DE 2026-08-28 — COMPATIBILIDADE ANDROID 1.0.14

**Branch:** `fix/auditoria-estabilidade-sync-v2`
**Versão Android:** `1.0.14-android-compat-hotfix` (`versionCode 15`)

### Falha confirmada e correção

- O app declara `minSdkVersion 22` (Android 5.1), mas o bundle usava recursos ausentes em Android System WebView antigo: `globalThis`, `Object.fromEntries`, `Promise.allSettled`, `Array.flatMap`, `String.matchAll`, `structuredClone` e `AbortController`.
- `Object.fromEntries` era avaliado ao carregar os setores e podia interromper a inicialização inteira. `Promise.allSettled` também aparece no carregador de chunks do Vite e podia quebrar telas abertas sob demanda. Esse cenário é compatível com tela branca somente em alguns aparelhos.
- O código próprio deixou de depender diretamente desses recursos quando há alternativa simples. `public/compatibility.js`, carregado antes do módulo principal, fornece fallbacks para os usos restantes das dependências.
- O mínimo prático foi fixado em Android System WebView 63, necessário para a sintaxe `import()` do bundle. Android 5.1 continua aceito desde que Android System WebView ou Google Chrome esteja atualizado.
- WebViews sem suporte a módulos recebem uma mensagem para atualizar WebView/Chrome em vez de uma tela vazia.
- Nenhuma tabela, policy, dado remoto, SQLite ou outbox foi alterado por esta correção.

### Risco conhecido

- O lint do módulo `app` não encontrou incompatibilidade `NewApi`/`InlinedApi` e terminou com zero erros. O lint global do Gradle ainda aponta `UnsanitizedFilenameFromContentProvider` dentro de `@capacitor/android` 5.7.8 em `node_modules`; corrigir isso exige avaliar atualização do Capacitor separadamente e não deve ser feito às pressas nesta hotfix.
- Em aparelhos sem Play Store/serviço de atualização e com WebView anterior à versão 63, o app não executará; a orientação é atualizar Android System WebView/Chrome. Não desinstalar o Gestão Rural para fazer isso.

### Instalação segura

- Instalar por cima do app existente. O `applicationId` permanece `com.gestaorural.app` e a assinatura deve ser conferida no APK final.
- Não desinstalar, não limpar armazenamento e não limpar o outbox.

### Validação

- `npm run lint`: passou sem avisos; `npm test -- --run`: 41 testes passaram; `npm run build`: passou com o aviso já conhecido do bundle principal de aproximadamente 891 KB.
- `npx cap sync android` e Gradle `assembleDebug`: concluídos com sucesso.
- Smoke Android offline: atualização instalada com `adb install -r`; tela inicial, lista de anomalias e nova anomalia abriram sem erro JavaScript ou exceção fatal. Os 24 itens pendentes do emulador permaneceram no outbox.
- O diálogo `System UI isn't responding` observado no AVD pertence ao System UI do emulador Android 16; após ocultar o diálogo, o Gestão Rural continuou responsivo. Não houve ANR atribuído ao pacote do app.
- APK: `builds/hotfix-android-compat/gestao-rural-1.0.14-android-compat-hotfix-debug.apk` (18.850.076 bytes).
- SHA-256 do APK: `2B4AFADEFDBF203AED745C0C522BD3F0B2985B412F9447B197E6583B57BDB7B2`.
- Assinatura SHA-256 mantida: `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`.

---

## ATUALIZAÇÃO DE 2026-08-28 — AUDITORIA DE INTEGRIDADE 1.0.13

**Branch:** `fix/auditoria-estabilidade-sync-v2`
**Versão Android:** `1.0.13-integrity-hotfix` (`versionCode 14`)

### Falhas confirmadas e corrigidas

- A leitura direta usada quando o cache estava vazio não tinha paginação e poderia parar no limite padrão do Supabase. Toda leitura remota agora usa a carga paginada de 500 em 500.
- A fazenda possui um nome de funcionário duplicado. Formulários procuravam o primeiro cadastro pelo nome e podiam gravar o `employee_id` errado. Seleção e gravação agora priorizam o ID; nomes repetidos mostram cargo e final do ID.
- Remover funcionário apagava o cadastro e prejudicava o histórico. A ação agora ativa/desativa por `status`, preservando registros antigos.
- A licença era aceita quando a fazenda não tinha nenhuma licença e ignorava `starts_at` futuro. Ambos os casos agora bloqueiam a validação.
- Datas de validade malformadas também passam a bloquear a validação, em vez de liberar acesso silenciosamente.
- O grace period offline rejeita datas inválidas ou muito no futuro, evitando liberação por relógio/contexto corrompido.
- Registros locais antigos `synced=false` sem `farm_id` ficavam preservados, mas invisíveis offline. Somente esses registros pendentes recebem a fazenda ativada; caches legados já sincronizados permanecem sem atribuição automática.
- PDFs e documentos cacheados eram preteridos pela URL remota no download. Offline, as telas agora tentam o arquivo local/cacheado antes da rede.

### Integridade observada em leitura

- Projeto do bundle: `vocnftkhnrfnbfvpnqtb`; ref antigo ausente do JavaScript final.
- Fazenda ativa, licença ativa, limite de 150 dispositivos e 97 dispositivos ativos.
- 886 anomalias: fev 2, mar 134, abr 165, mai 165, jun 143, jul 153 e ago 124. O banco atual não contém anomalias de janeiro.
- Todas as 886 anomalias possuem `createdAt` válido; zero IDs duplicados e zero fingerprints duplicadas.
- 48 funcionários ativos; uma duplicidade de nome; todos os `employee_id` presentes nas anomalias apontam para funcionários válidos e ativos.
- 245 registros de leite e 430 métricas diárias, sem datas/chaves duplicadas e sem valores inválidos.
- A auditoria não encontrou rotina automática que apague anomalias. Exclusões continuam sendo ações explícitas protegidas por PIN.

### Pendências reais

- `updated_at` ainda não existe em cinco tabelas operacionais (`42703`). O fallback evita perda, mas aumenta carga e pode atrasar atualização de edições. A migration aditiva `202608200001_add_operational_updated_at.sql` não foi aplicada.
- Não há trilha de auditoria/soft delete para exclusões explícitas. Uma migration futura deve registrar quem excluiu e permitir restauração.
- Não foi possível provar se as anomalias de janeiro existiam no projeto antigo porque não há snapshot/credencial somente leitura do banco antigo no workspace.
- O bundle principal continua grande (aproximadamente 890 KB minificado); isso é risco de desempenho de abertura, não divergência de dados.

### Validação

- `npm run lint`: passou sem avisos.
- `npm test -- --run`: 40 testes passaram.
- `npm run build`: passou; somente aviso não bloqueante de chunk grande.
- Auditoria Supabase executada somente em leitura. Nenhuma migration, policy ou dado remoto foi alterado.

---

## ATUALIZAÇÃO DE 2026-08-28 — MÉDIAS, EXCEL, PARETO E RETORNO DO APP

**Branch:** `fix/auditoria-estabilidade-sync-v2`
**Versão Android:** `1.0.12-reports-sync-hotfix` (`versionCode 13`)

### Correções e melhorias

- A tela de leite voltou a mostrar total e média diária do mês selecionado.
- O botão **Médias de janeiro a dezembro** abre um resumo anual com os 12 meses, inclusive meses sem lançamento, mais total/média do ano e total/média geral.
- As médias são calculadas diretamente de `milk_daily` por dia efetivamente registrado; não dependem de `farm_monthly_stats`, que está vazia no banco atual.
- A lista de anomalias exporta todos os resultados filtrados para CSV UTF-8 compatível com Excel, com data, setor, descrição, solução e status, sem responsável.
- A tela de quantidade ganhou Pareto por setor, percentual individual e percentual acumulado, além de exportação anual.
- Setores legados em caixa alta/sem acento são normalizados apenas na leitura, sem alterar o banco.
- Ao retornar do segundo plano no Android, o app inicia sync imediatamente se estiver online. Antes dependia do temporizador, que pode ser suspenso pelo Android.
- O exportador salva no Android em `Documentos/Gestao Rural` e mantém o download convencional no navegador.

### Auditoria somente leitura do Supabase atual

- Projeto confirmado: `vocnftkhnrfnbfvpnqtb`; fazenda `starmilk` ativa; nenhum acesso ao projeto antigo.
- `anomalies`: 886; `notices`: 85; `improvements`: 17; `instructions`: 27; `farm_docs`: 15.
- `milk_daily`: 245 registros, de 08/12/2025 a 27/08/2026; zero datas duplicadas e zero valores inválidos.
- `daily_metrics`: 430 registros (`lactation` 226, `births` 174, `discard` 30); zero chaves duplicadas e zero valores inválidos.
- Todas as tabelas sincronizadas aceitam `farm_id`, `employee_id`, `employee_name` e `device_id`.
- Não foi feita escrita, migration ou alteração de policy no Supabase.
- A migration aditiva `202608200001_add_operational_updated_at.sql` continua pendente de autorização. O app mantém fallback seguro enquanto ela não for aplicada.

### Validação

- `npm test`: 32 testes passaram, cobrindo médias mensais, janeiro/timezone, Pareto, CSV/Excel, grande volume e integridade do sync.
- `npm run lint` e `npm run build`: concluídos sem erro.
- Gradle `assembleDebug`: concluído com sucesso.
- Smoke Android somente leitura: 11 telas renderizadas; exportação de anomalias presente; Pareto e acumulado presentes; resumo de leite exibiu JAN a DEZ, total/média do ano e total/média geral. Nenhum registro local ou remoto foi criado ou apagado nesse teste.
- APK: `builds/hotfix-reporting-sync/gestao-rural-1.0.12-reports-sync-hotfix-debug.apk`.
- `applicationId`: `com.gestaorural.app`; assinatura SHA-256 mantida: `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`.
- SHA-256 do APK: `5BBECDE129D56A5B51038E03C01CE5D644A709CE4F4DCBDE42B398336F838D76`.
- Auditoria reproduzível: `node scripts/read-only-data-audit.mjs` (somente leitura; não imprime chaves).

---

## CONTEXTO DO PROJETO

**App:** Gestão Rural — app mobile Android para fazendas leiteiras.
**Stack:** React 18 + TypeScript + Vite + Tailwind + Capacitor 5 (APK Android) + Supabase (backend) + Dexie.js (IndexedDB, web) + SQLite via `@capacitor-community/sqlite` (nativo Android).
**Arquitetura:** Offline-first com outbox pattern — todo write vai para banco local primeiro (synced=false) + outbox, depois sincroniza com Supabase quando online.
**Banco local web:** `FarmDB_Web_v3` (Dexie/IndexedDB).
**Banco local nativo:** `FarmDB_Native_v1` (SQLite).
**Chave de contexto:** `gestao_rural_farm_context_v2` no localStorage — armazena `farm_id`, `employee_id`, `device_id`, etc.

---

## ATUALIZAÇÃO DE 2026-08-28 — HOTFIX DE ESTABILIDADE E SINCRONIZAÇÃO

**Branch:** `fix/auditoria-estabilidade-sync-v2`
**Versão Android:** `1.0.11-data-sync-hotfix` (`versionCode 12`)
**Backend embutido no APK:** `vocnftkhnrfnbfvpnqtb`; o ref antigo `lviwvkvkeyzqdcbevaih` não está no bundle.

### Causas confirmadas

- `milk_daily`, `daily_metrics` e `farm_monthly_stats` não possuem coluna `id`, mas a leitura antiga ordenava todas as tabelas por `id`. O Supabase retornava `42703` e cada aparelho permanecia com um cache diferente.
- As tabelas operacionais ainda não possuem `updated_at` no banco remoto. O fallback para `createdAt` existia, mas o cursor podia avançar para o horário atual e esconder registros adicionados posteriormente com data antiga.
- A reconciliação completa ficava presa a uma flag permanente. Agora cada processo do app tenta uma carga completa segura uma vez por abertura e repete se alguma tabela crítica falhar.
- O SQLite nativo publicava a conexão antes de `open()` e do schema terminarem. Chamadas concorrentes podiam falhar com `database FarmDB_Native_v1 not opened`, principalmente em aparelhos mais lentos.
- A carga completa fazia uma consulta SQLite por registro recebido. Com 883 anomalias isso gerava mais de mil travessias pela ponte Android e podia aparentar travamento.
- Uma exclusão ainda pendente no outbox podia reaparecer localmente durante uma carga remota. IDs locais não sincronizados e deletes pendentes/errados agora são protegidos.

### Correções desta etapa

- Paginação de 500 em 500 até o fim, com ordenação por `id`, `date`, `date + type` ou `monthKey` conforme o schema real.
- Cursores vazios não avançam; o fallback legado usa o maior `createdAt`/`updatedAt` realmente recebido.
- Leite e métricas fazem reconciliação completa, pois `date` é chave de negócio e não timestamp de alteração.
- Abertura do SQLite tornou-se atômica; todas as chamadas concorrentes aguardam a mesma `initPromise`.
- `bulkPut()` nativo usa `executeSet` em lotes de 100, reduzindo drasticamente chamadas JNI/WebView.
- Conflitos locais são verificados em lote, sem sobrescrever `synced=false` e sem ressuscitar deletes do outbox.
- Telas de anomalias e produção leem o cache primeiro, recebem notificações do `bulkPut` e mantêm dados locais visíveis quando a rede falha.
- Erros de atualização deixam aviso visível; sucesso não é mais informado quando uma tabela crítica falhou.

### Integridade verificada em leitura

- Fazenda `starmilk`: ativa; licença ativa; 48 funcionários ativos; 97 dispositivos ativos.
- `anomalies`: 883; `milk_daily`: 245; `daily_metrics`: 430; todos os registros dessas consultas pertencem à fazenda ativa.
- Anomalias em 2026: jan 0, fev 2, mar 134, abr 165, mai 165, jun 143, jul 153, ago 121.
- Nenhuma migration e nenhuma escrita foram aplicadas ao banco remoto nesta auditoria.
- A migration aditiva `202608200001_add_operational_updated_at.sql` continua pendente de validação/autorização.

### Validação executada

- `npm run test`: 27 testes passaram, incluindo 883 anomalias e todos os 12 meses.
- `npm run lint`: passou sem warnings.
- `npm run build`: passou; apenas aviso não bloqueante de chunk grande.
- Gradle `assembleDebug`: passou.
- Smoke Android: SQLite abriu; lote nativo de 120 registros inseriu 120 e removeu apenas os 120 registros de teste; 10 telas críticas renderizaram sem exceção.
- APK: `builds/hotfix-data-sync/gestao-rural-1.0.11-data-sync-hotfix-debug.apk`.
- `applicationId`: `com.gestaorural.app`; assinatura SHA-256 mantida: `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`.

### Instalação segura

- Instalar por cima da versão existente. Não desinstalar, não limpar armazenamento e não limpar o outbox.
- O APK usa o mesmo `applicationId` e a mesma assinatura das hotfixes anteriores, preservando SQLite, contexto e mídias locais.

---

## ATUALIZAÇÃO DE 2026-05-24 — HOTFIX DE CACHE/SYNC

**Branch:** `hotfix-sync-anomalias-auditoria`
**Supabase local configurado:** Gestão Rural Teste (`vocnftkhnrfnbfvpnqtb`)
**Fazenda ativa no banco novo:** `starmilk` / código `STARMILK` / `farm_id = e6ba88a9-9a59-4a13-8d4d-bf4d914acf90`

### Diagnóstico confirmado

- Os dados dos dias 22 e 23 estavam no Supabase novo, mas o app podia não mostrar porque o cache local já tinha registros antigos e `smartRead()` só consultava o servidor quando a tabela local estava vazia.
- O delta-sync por `createdAt` também podia deixar de baixar registros históricos copiados depois, porque o `last_refresh_anomalies` do aparelho podia estar mais novo que a data real do registro.
- Registros locais antigos sem `farm_id` ficavam invisíveis depois do filtro estrito multi-fazenda.

### Correções aplicadas

- `smartRead()` agora faz uma carga completa merge-only na primeira leitura online de cada tabela/fazenda, mesmo que já exista cache local.
- `smartRead()` passou a usar `filterByCurrentFarm()`; dados operacionais sem `farm_id` não passam mais como se fossem globais.
- `migrateLocalIds()` agora também repara registros locais antigos sem contexto, preenchendo `farm_id`, `employee_id`, `employee_name` e `device_id` a partir da fazenda/funcionário ativo.
- `App.tsx` mudou a flag para `full_refresh_after_supabase_switch_v6`, forçando uma nova carga completa segura na próxima abertura da hotfix.
- `App.tsx` roda `migrateLocalIds()` antes de `recoverOrphanedRecords()`, para recuperar outbox com IDs novos.
- `App.tsx` sincroniza o outbox antes da carga completa do servidor. Isso evita que dados locais pendentes fiquem escondidos por cache remoto antigo.
- `SettingsScreen` ganhou botão **Recarregar tudo do servidor** em Dados de Produção.
- `sync.service.ts` deixou de anexar `employee_id/employee_name/device_id` em tabelas de configuração como `settings`, `farm_settings` e `sectors`.
- `sync.service.ts` agora processa inserts/updates como upsert idempotente com fallback de constraints, para retries de mídia/schema não travarem em duplicidade.
- `localdb.ts` passou a recuperar órfãos web com `synced === false` ou `synced === 0`, corrigindo casos em que IndexedDB guardava boolean e a busca antiga não encontrava nada.
- `refreshFromServer()` preserva registros locais `synced=false` e não sobrescreve dados ainda presos no aparelho.
- `activation.service.ts` valida funcionário por `employee_id + farm_id`, evitando contexto de funcionário de outra fazenda.
- `.env.local` local recebeu `VITE_OWNER_CODE` definido como código do dono; esse valor não deve ser commitado.

### Validação no banco Gestão Rural Teste

- `anomalies`: 470 registros.
- `milk_daily`: 149 registros.
- `daily_metrics`: 252 registros.
- `notices`: 49 registros.
- `improvements`: 16 registros.
- `instructions`: 27 registros.
- `farm_id` nulo nas tabelas principais: 0.
- Anomalias dos dias 22/23 confirmadas no banco novo: 8 registros.
- Leite dos dias 22/23 confirmado: `2026-05-22 = 33564 L`, `2026-05-23 = 33194 L`.
- Métricas dos dias 22/23 confirmadas: lactação `867` e `870`.
- `employees.is_admin/admin_pin` aplicado e validado para SANDRO.

### Diagnóstico adicional de 2026-05-24

- O schema antigo ainda tinha constraints globais herdadas de "um banco por fazenda":
  - `milk_daily(date)` impedia duas fazendas de registrarem leite no mesmo dia.
  - `daily_metrics(date,type)` impedia métricas iguais em fazendas diferentes.
  - `sectors(name)` impedia setores iguais em fazendas diferentes.
  - `ui_config(id)` e `farm_settings(id)` deixavam configs fixas globais.
- Criada e aplicada no Supabase novo a migration `202605240002_multi_farm_conflict_keys.sql` para trocar essas constraints por constraints compostas com `farm_id`, sem apagar dados, sem `DROP TABLE`, sem `TRUNCATE` e sem `DROP COLUMN`.
- Criada e aplicada no Supabase novo a migration `202605240003_settings_conflict_key.sql` como no-op seguro para bancos que tenham `public.settings`.
- O código do sync foi ajustado para usar os conflitos novos (`farm_id,date`, `farm_id,date,type`, `farm_id,name`, `farm_id,id`) com fallback para o schema antigo enquanto a migration ainda não estiver aplicada.

### Validação local

- `npm run lint`: passou.
- `npx tsc --noEmit`: passou.
- `npm run build`: passou, com aviso normal de chunk grande do Vite.
- Servidor local aberto para teste em `http://localhost:3000`.

### Ainda pendente

- Gerar e instalar APK/AAB final no aparelho do cliente com o mesmo `applicationId` e mesma assinatura da versão anterior.
- No aparelho afetado, abrir Configurações → Dados de Produção → **Recarregar tudo do servidor** se a tela ainda estiver usando cache antigo.
- Conferir no DiagnosticScreen se `farm_id`, funcionário, outbox e último sync estão corretos.

---

## ESTRUTURA DOS ARQUIVOS-CHAVE

```
services/
  db.service.ts          ← CRUD principal, refreshFromServer, smartRead/Write, migrações
  sync.service.ts        ← Processa outbox, upload de mídia, markAsSynced
  localdb.ts             ← Abstração web vs nativo (Dexie ou SQLite)
  localdb.web.ts         ← Schema Dexie (12 tabelas + outbox + media_blobs)
  localdb.native.ts      ← SQLite com kv_store + outbox
  activation.service.ts  ← Valida código da fazenda, ativa contexto
  auth.service.ts        ← Autenticação por PIN admin
  farm-context.service.ts ← Lê/salva AppActivationContext no localStorage
  admin.service.ts       ← CRUD de fazendas, licenças, devices (para painel owner)

screens/
  ActivationScreen.tsx         ← Tela de ativação (código da fazenda + seleção de funcionário)
  ListAnomaliesScreen.tsx      ← Lista de anomalias
  AnomalyQuantityScreen.tsx    ← Gráfico/quantidade de anomalias
  SettingsScreen.tsx           ← Configurações (PIN protegido)
  DiagnosticScreen.tsx         ← Diagnóstico técnico (sem PIN)
  farmdata/DataMetricScreen.tsx ← Dados de leite, lactação, descartes, nascimentos

types.ts     ← Todos os tipos TypeScript
App.tsx      ← Roteamento, startup sync cycle
```

---

## CONCEITO DE LOCAL RECORD (IMPORTANTE)

O banco local armazena dados no formato **LocalRecord** (wrapper):

```typescript
interface LocalRecord {
  id: string;       // chave local (ex: "${farm_id}_${date}")
  data: any;        // o objeto de dados real (ex: { farm_id, date, liters })
  updated_at: string;
  synced: boolean;  // false = tem alteração pendente para enviar ao Supabase
  mediaTotalBytes?: number;
}
```

`localdb.getAll()` e `localdb.getById()` retornam apenas `.data` (desembrulhado).
`localdb.getRawById()` retorna o LocalRecord completo com `synced`.

---

---

# FASE 1 — BUGS CRÍTICOS

> **Status: ✅ CONCLUÍDA INTEGRALMENTE**

---

### Bug 1 — `farm_monthly_stats` inexistente no schema Dexie
**Arquivo:** `services/localdb.web.ts`
**Problema:** A tabela `farm_monthly_stats` existia no Supabase e era usada em código, mas não estava declarada no schema Dexie. Resultado: qualquer tentativa de ler/salvar stats mensais no banco local lançava erro silencioso.
**Correção:** Adicionada a tabela `farm_monthly_stats!: Table<LocalRecord>` na classe `WebFarmDatabase` e registrada em `version(2).stores(...)` para migração automática em instalações existentes.
**Arquivo editado:** `services/localdb.web.ts` — propriedade da classe + versão 2 do schema.

---

### Bug 2 — UPDATE/DELETE sem `farm_id` em `milk_daily` e `daily_metrics`
**Arquivo:** `services/sync.service.ts`
**Problema:** Ao processar o outbox, operações de UPDATE e DELETE em `milk_daily` e `daily_metrics` usavam apenas `eq('date', ...)` sem filtrar por `farm_id`. Isso significava que atualizar "leite do dia 22" na Fazenda A poderia sobrescrever o registro da Fazenda B.
**Correção:** Adicionado `.eq('farm_id', farmId)` após o `.eq('date', ...)` em todos os UPDATE e DELETE dessas tabelas em `processItem()`.
**Arquivo editado:** `services/sync.service.ts` — função `processItem()`, casos `case 'update'` e `case 'delete'` para `milk_daily` e `daily_metrics`.

---

### Bug 3 — Detecção de conflito offline nunca funcionava
**Arquivo:** `services/db.service.ts`, `services/localdb.ts`, `services/localdb.native.ts`
**Problema:** A detecção de conflito chamava `localdb.getById()` que retorna apenas `.data` (sem o wrapper). Depois verificava `(local as any).synced === false` — mas `.synced` não existe em `.data`, só no wrapper. Resultado: conflito nunca detectado.
**Correção:** Adicionado método `getRawById()` em `localdb.ts` e `localdb.native.ts` que retorna o LocalRecord completo `{ id, synced, data }`. A detecção de conflito em `db.service.ts` passou a usar `localdb.getRawById()` e verifica `raw.synced === false`.
**Arquivos editados:** `services/localdb.ts` (novo método), `services/localdb.native.ts` (novo método), `services/db.service.ts` (uso do novo método).

---

### Bug 4 — Loop infinito de refresh em `ListAnomaliesScreen`
**Arquivo:** `screens/ListAnomaliesScreen.tsx`
**Problema:** `loadData()` chamava `forceRefreshTable('anomalies')` → que fazia `bulkPut` → que disparava `notifyChange('anomalies')` → que chamava o subscriber → que chamava `loadData()` de novo. Loop infinito. Durante cada iteração havia uma janela em que `items` ficava vazio, causando o bug "lista mostra 0 itens".
**Correção:** Separadas as responsabilidades: ao montar a tela, chama `loadData(forceServerRefresh=true)` uma única vez. O subscriber do localdb chama `loadData(forceServerRefresh=false)` (só lê local, não dispara novo refresh). Adicionado `loadingRef = useRef(false)` para guard contra re-entrância.
**Arquivo editado:** `screens/ListAnomaliesScreen.tsx` — lógica do useEffect e da função `loadData`.

---

### Bug 5 — `getUIConfig` sobrescrevia customizações do usuário
**Arquivo:** `services/db.service.ts`
**Problema:** Quando novos botões eram adicionados ao `DEFAULT_UI_BUTTONS`, a função `getUIConfig` substituía toda a config do usuário pelos defaults, apagando personalizações de cor, ordem e visibilidade.
**Correção:** A função agora identifica apenas os botões com IDs novos (ausentes na config atual) e faz **merge** — adiciona os novos sem tocar nos existentes.
**Arquivo editado:** `services/db.service.ts` — função `getUIConfig`.

---

### Bug 6 — `saveUIConfig` com `id: 1` (número) em vez de string
**Arquivo:** `services/db.service.ts`
**Problema:** O smartWrite usava `id: 1` (number). O Dexie exige que a chave seja do tipo declarado no schema (`string`). Isso causava erros silenciosos ao salvar configurações de UI.
**Correção:** Alterado para `id: '1'` (string).
**Arquivo editado:** `services/db.service.ts` — `saveUIConfig`.

---

### Bug 7 — `migrateRaspagemToConforto` sem idempotência e com campo errado
**Arquivo:** `services/db.service.ts`
**Problema (1):** A migração verificava `a.data?.sector` mas `localdb.getAll()` retorna `.data` desembrulhado — portanto o campo correto é `a.sector`. A migração nunca encontrava nada e nunca rodava.
**Problema (2):** Passava objetos brutos (`.data`) para `localdb.bulkPut()` que espera LocalRecords. Resultava em escrita incorreta.
**Problema (3):** Sem idempotência: rodaria infinitas vezes.
**Correção:** Reescrita com: flag `localStorage.setItem(FLAG, 'true')` para idempotência, campo `a.sector` correto, wrapped correto como `{ id: a.id, data: {...a, sector: 'Conforto'}, updated_at, synced: false }`.
**Arquivo editado:** `services/db.service.ts` — função `migrateRaspagemToConforto`.

---

---

# FASE 2 — BUGS RESTANTES

> **Status: ✅ CONCLUÍDA INTEGRALMENTE**

---

### Bug 8 — Colisão de ID em `milk_daily` e `daily_metrics` entre fazendas
**Arquivos:** `services/db.service.ts`, `services/sync.service.ts`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
O ID local para `milk_daily` era apenas `date` (ex: `"2026-05-22"`). Em multi-fazenda:
- Device A (Fazenda X) salva: `{ id: "2026-05-22", data: { farm_id: "FARM_X", liters: 500 } }`
- Device B (Fazenda Y) salva: `{ id: "2026-05-22", data: { farm_id: "FARM_Y", liters: 300 } }`
- Quando o Device A sincroniza e faz `bulkPut`, o registro de FARM_Y sobrescreve o de FARM_X localmente.
- Resultado: dados do dia 21/22/23 somem em alguns dispositivos.

O mesmo problema ocorria em `daily_metrics` com ID `"${date}_${type}"` sem farm_id.

#### Fechamento validado ✅
As pendências deste bug foram fechadas no código:

- `localRecordId()` agora gera IDs locais compostos por `farm_id` para `milk_daily`, `daily_metrics` e `farm_monthly_stats`.
- `add/update/delete` de leite e métricas usam ID local composto sem alterar o payload remoto de delete.
- `smartRead()` usa `localRecordId()`, aplica filtro estrito por fazenda e faz uma carga completa merge-only na primeira leitura online de cada tabela/fazenda.
- `recoverOrphanedRecords()` calcula chaves com `farm_id`.
- `markAsSynced()` e `markAsPendingMedia()` usam IDs compostos.
- `migrateLocalIds()` foi ampliado: além de re-keying, repara registros locais antigos sem `farm_id`, `employee_id`, `employee_name` e `device_id` usando o contexto atual.
- `App.tsx` chama `migrateLocalIds()` antes de recuperar órfãos, para o outbox ser recriado com o ID novo quando necessário.

---

### Bug 9 — `refreshFromServer` puxa dados de outras fazendas (farm_id.is.null)
**Arquivo:** `services/db.service.ts`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
A função `makeBaseQuery()` (linha ~244) usa:
```typescript
q = q.or(`farm_id.eq.${currentFarmId},farm_id.is.null`);
```
A cláusula `farm_id.is.null` foi adicionada para suportar dados "globais" sem farm_id. Porém, para tabelas de dados operacionais (anomalias, leite, instruções etc.), registros sem `farm_id` são dados **legados sem dono definido** — não devem aparecer para todos.

#### Correção
Criar constante `configOnlyTables` e aplicar filtro diferente:

```typescript
const configOnlyTables = new Set(['ui_config', 'farm_settings', 'settings', 'sectors']);

// Em makeBaseQuery():
if (currentFarmId && farmScopedTables.has(tableName)) {
  if (configOnlyTables.has(tableName)) {
    // Config: aceita registros globais como fallback
    q = q.or(`farm_id.eq.${currentFarmId},farm_id.is.null`);
  } else {
    // Dados: apenas da fazenda atual, sem exceções
    q = q.eq('farm_id', currentFarmId);
  }
}
```

O mesmo padrão deve ser aplicado em `smartRead()` (linha ~340).

---

### Bug 10 — `filterByCurrentFarm` deixa passar dados sem `farm_id`
**Arquivo:** `services/db.service.ts`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
A função `filterByCurrentFarm` (linha ~107):
```typescript
return rows.filter((row: any) => !row?.farm_id || row.farm_id === currentFarmId);
```
A condição `!row?.farm_id` significa: "se o registro não tem farm_id, deixa passar". Isso faz dados legados sem `farm_id` aparecerem para TODAS as fazendas.

#### Correção
Usar o mesmo conceito de `configOnlyTables`:

```typescript
const filterByCurrentFarm = <T>(tableName: string, rows: T[]): T[] => {
  const currentFarmId = farmContextService.getFarmId();
  if (!currentFarmId || !farmScopedTables.has(tableName)) return rows;
  if (configOnlyTables.has(tableName)) {
    // Config: aceita registros sem farm_id como fallback global
    return rows.filter((row: any) => !row?.farm_id || row.farm_id === currentFarmId);
  }
  // Dados: exige farm_id exata
  return rows.filter((row: any) => row?.farm_id === currentFarmId);
};
```

---

### Bug 11 — `selectedMonth` em localStorage sem prefixo de `farm_id`
**Arquivo:** `screens/farmdata/DataMetricScreen.tsx`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
`DataMetricScreen.tsx` (linhas 59–70) usa a chave `'selectedMonth'` no localStorage para persistir o mês selecionado no gráfico. Esta chave é compartilhada entre todos os contextos de fazenda. Se o app trocar de fazenda, o mês selecionado da outra fazenda reaparece.

#### Correção
Usar a `farm_id` como prefixo da chave:

```typescript
import { farmContextService } from '../../services/farm-context.service';

const MONTH_KEY = `selectedMonth_${farmContextService.getFarmId() || 'default'}`;

// Leitura:
const [selectedMonth, setSelectedMonth] = useState(() => {
  const saved = localStorage.getItem(MONTH_KEY);
  if (saved) return saved;
  // ... calcular mês atual
});

// Persistência:
useEffect(() => {
  localStorage.setItem(MONTH_KEY, selectedMonth);
  // ...
}, [selectedMonth]);

// Também corrigir monthPickerYear (linha ~38):
const [monthPickerYear, setMonthPickerYear] = useState(() => {
  const saved = localStorage.getItem(MONTH_KEY);
  // ...
});
```

---

### Bug 12 — `DiagnosticScreen` com project IDs Supabase hardcoded e desatualizados
**Arquivo:** `screens/DiagnosticScreen.tsx`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
Linha 324 do `DiagnosticScreen.tsx`:
```tsx
value={
  data.supabaseUrl.includes('vocnftkhnrfnbfvpnqtb') ? 'Gestao Rural Teste (vocnft...)' :
  data.supabaseUrl.includes('lviwvkvkeyzqdcbevaih') ? 'Fazenda Star Milk MDA antigo (lviwv...)' :
  'Outro projeto'
}
```
Hardcoda dois IDs de projeto Supabase com rótulos desatualizados ("antigo"). Confunde qualquer dev ao analisar o diagnóstico.

#### Correção
Substituir por simples exibição da URL sem interpretação:
```tsx
<InfoRow label="Projeto Supabase" value={data.supabaseUrl || '(não configurado)'} />
```

---

### Bug 13 — `validateAndRepairData` promete sincronizar mas não faz nada
**Arquivo:** `services/sync.service.ts`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
A função `validateAndRepairData()` (linha ~457) detecta dados com problemas mas ao retornar `isHealthy: false`, apenas escreve na mensagem "Sincronizando com servidor..." sem chamar qualquer função de sincronização.

#### Correção
Adicionar chamada real quando há problemas:
```typescript
if (hasIssues) {
  try {
    await db.forceFullRefreshFromServer();  // ← adicionar esta linha
  } catch (e) {
    console.error('Erro ao reparar dados:', e);
  }
  return {
    isHealthy: false,
    message: 'Dados com inconsistências detectadas. Sincronização com servidor executada.'
  };
}
```

---

### Bug 14 — App.tsx com dois `<HashRouter>` independentes
**Arquivo:** `App.tsx`
**Status: ✅ Verificado — não é bug real**

Embora o CLAUDE2 original listasse isso como bug, os dois `<HashRouter>` são **mutuamente exclusivos** (renderização condicional: um quando `!activated`, outro quando `activated && startupReady`). Nunca são renderizados simultaneamente. **Não requer correção.**

---

### Bug 15 — `AnomalyQuantityScreen` bloqueia visualização com PIN desnecessário
**Arquivo:** `screens/AnomalyQuantityScreen.tsx`
**Status: ✅ Concluído nesta sessão**

#### Causa raiz
A tela de "Quantidade de Anomalias" (gráficos/estatísticas) verifica `authService.isAuthenticated()` ao montar (linha ~64) e exibe modal de PIN para qualquer usuário. Esta é uma tela de **visualização apenas** — nenhuma edição é feita. O PIN aqui serve apenas para dificultar o uso legítimo.

#### Correção
Remover completamente a verificação de autenticação. A tela deve carregar os dados diretamente:

```typescript
// REMOVER:
const [showPinModal, setShowPinModal] = useState(false);
const [accessGranted, setAccessGranted] = useState(false);
// REMOVER o useEffect que checa authService.isAuthenticated()
// REMOVER o {showPinModal && <PinRequestModal .../>}
// REMOVER o {!accessGranted && <div>bloqueado</div>}

// MANTER: loadAnomalies() chamado direto no useEffect de montagem
useEffect(() => {
  loadAnomalies();
  const unsub = localdb.subscribe('anomalies', loadAnomalies);
  return () => unsub?.();
}, []);
```

---

---

# FASE 3 — SISTEMA DE PERMISSÕES (DONO vs FAZENDA)

> **Status: ✅ CONCLUÍDA INTEGRALMENTE**
> **Objetivo:** Criar conta especial do "Dono do App" que vê e gerencia todas as fazendas, sem que contas normais de fazenda tenham esse acesso.

---

## Visão Geral da Arquitetura de Permissões

```
Código digitado na ActivationScreen
        │
        ├─ É igual a VITE_OWNER_CODE?
        │     └─ SIM → ativar modo Dono → redirecionar para /owner (OwnerDashboardScreen)
        │
        └─ NÃO → buscar fazenda no Supabase (fluxo normal)
                  └─ selecionar funcionário → ativar contexto normal → redirecionar para /
```

---

### Tarefa 16 — Adicionar campos ao `AppActivationContext` em `types.ts`
**Status: ✅ Concluído nesta sessão**

Campos adicionados à interface:
```typescript
is_owner?: boolean;  // true se ativado com o código dono
admin_pin?: string;  // PIN específico do funcionário (se configurado no banco)
```

---

### Tarefa 17 — Adicionar campos `admin_pin` e `is_admin` ao `Employee` em `types.ts`
**Status: ✅ Concluído**
**Arquivo:** `types.ts`

```typescript
export interface Employee {
  id: string;
  farm_id?: string;
  name: string;
  role: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  photoUri?: string;
  is_admin?: boolean;   // ← ADICIONAR
  admin_pin?: string;   // ← ADICIONAR
}
```

---

### Tarefa 18 — Documentar `VITE_OWNER_CODE` no `.env.example`
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `.env.example`

Adicionar ao final do arquivo:
```
# Código secreto do dono do app (nunca compartilhar).
# Quem digitar este código na tela de ativação entra no modo Dono.
# Deixe em branco para desativar este acesso.
VITE_OWNER_CODE=
```

O valor real deve ser definido no `.env.local` (nunca no `.env.example`).

---

### Tarefa 19 — Modificar `activation.service.ts` para suportar código dono
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `services/activation.service.ts`

**Passo A:** Modificar `validateActivationCode` para retornar `isOwner: boolean`:

```typescript
async validateActivationCode(
  code: string
): Promise<{ farm: Farm | null; employees: Employee[]; isOwner: boolean }> {
  const normalized = code.trim().toUpperCase();

  // Verificar se é código dono ANTES de ir ao Supabase
  const ownerCode = (import.meta.env.VITE_OWNER_CODE || '').trim().toUpperCase();
  if (ownerCode && normalized === ownerCode) {
    return { farm: null, employees: [], isOwner: true };
  }

  // Fluxo normal de fazenda...
  const { data: farm, error } = await supabase.from('farms').select('*')
    .eq('activation_code', normalized).maybeSingle();
  // ... restante do código existente ...
  return { farm: farm as Farm, employees: employees as Employee[], isOwner: false };
},
```

**Passo B:** Carregar `admin_pin` e `is_admin` do funcionário selecionado no `activate()`:

```typescript
async activate(farm: Farm, employee: Employee) {
  const device = await deviceService.ensureDevice(farm, employee);
  const ctx = {
    farm_id: farm.id,
    farm_name: farm.name,
    employee_id: employee.id,
    employee_name: employee.name,
    device_id: device.device_id,
    last_license_check_at: new Date().toISOString(),
    license_status: 'active',
    device_status: device.status,
    grace_period_days: farm.grace_period_days || 7,
    is_owner: false,
    admin_pin: employee.admin_pin || undefined,  // ← NOVO: PIN específico do func.
  };
  farmContextService.saveContext(ctx);
  return ctx;
},
```

**Passo C:** Adicionar método `activateAsOwner()`:

```typescript
async activateAsOwner() {
  const deviceId = farmContextService.getDeviceId();
  const ctx: AppActivationContext = {
    farm_id: 'owner',
    farm_name: 'Dono do App',
    employee_id: 'owner',
    employee_name: 'Dono',
    device_id: deviceId,
    is_owner: true,
    last_license_check_at: new Date().toISOString(),
    license_status: 'active',
    device_status: 'active',
  };
  farmContextService.saveContext(ctx);
  return ctx;
},
```

---

### Tarefa 20 — Modificar `ActivationScreen.tsx` para detectar e tratar código dono
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `screens/ActivationScreen.tsx`

A tela atual tem dois passos: (1) validar código → (2) selecionar funcionário. Para o código dono, o passo 2 deve ser diferente.

```typescript
// Adicionar estado:
const [isOwner, setIsOwner] = useState(false);

// Modificar validateCode:
const validateCode = async () => {
  setLoading(true);
  try {
    const result = await activationService.validateActivationCode(code);
    if (result.isOwner) {
      setIsOwner(true);
      // Não mostra lista de funcionários — mostra confirmação de dono
    } else {
      setFarm(result.farm);
      setEmployees(result.employees);
      setSelectedEmployeeId(result.employees[0]?.id || '');
    }
    notify(result.isOwner ? 'Código de dono reconhecido.' : 'Fazenda validada.', 'success');
  } catch ...
};

// Adicionar fluxo para dono no JSX:
{isOwner && (
  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
    <p className="font-black text-yellow-800">Acesso de Dono do App</p>
    <button onClick={async () => {
      setLoading(true);
      try {
        await activationService.activateAsOwner();
        onActivated();
      } finally { setLoading(false); }
    }}>
      Entrar como Dono
    </button>
  </div>
)}

{/* Mostrar lista de funcionários apenas se NÃO for owner */}
{farm && !isOwner && ( /* ... lista existente ... */ )}
```

---

### Tarefa 21 — Criar `screens/OwnerDashboardScreen.tsx` (NOVO ARQUIVO)
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `screens/OwnerDashboardScreen.tsx` (criado do zero)

Esta tela é o painel exclusivo do dono. Deve mostrar:
- Lista de todas as fazendas (`adminService.listFarms()`)
- Para cada fazenda: nome, código de ativação, status (active/blocked/expired), data de expiração
- O admin de cada fazenda (employee com `is_admin = true`)
- Ações: bloquear/ativar fazenda, ver devices, alterar PIN admin

Estrutura sugerida de componentes dentro do arquivo:
```
OwnerDashboardScreen
  └── Header "Painel do Dono"
  └── Lista de fazendas (cards)
        ├── FarmCard: nome, código, status badge, admin name
        ├── Botão "Gerenciar" → abre modal com:
        │     ├── alterar status da fazenda (ativo/bloqueado)
        │     ├── devices ativos
        │     └── alterar PIN admin do funcionário administrador
        └── Botão "Sair do Modo Dono" (limpa contexto, volta para ActivationScreen)
```

Funções disponíveis em `services/admin.service.ts`:
- `adminService.listFarms()` → `Farm[]`
- `adminService.saveFarm(farm)` → salva alterações
- `adminService.listDevices(farmId)` → `DeviceRegistration[]`
- `adminService.setDeviceStatus(deviceId, status)` → bloqueia/ativa device

Para buscar o admin de cada fazenda:
```typescript
const { data: admins } = await supabase
  .from('employees')
  .select('*')
  .eq('farm_id', farm.id)
  .eq('is_admin', true);
```

---

### Tarefa 22 — Adicionar rota `/owner` em `App.tsx` e redirecionar dono
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `App.tsx`

**Passo A:** Adicionar import do `OwnerDashboardScreen`.

**Passo B:** No estado inicial do App, verificar se o contexto é de dono:

```typescript
const [activated, setActivated] = useState(() => {
  const isActivated = farmContextService.isActivated();
  return isActivated;
});

// Após ativação (callback onActivated no ActivationScreen), verificar se é owner:
const handleActivated = () => {
  const ctx = farmContextService.getContext();
  if (ctx?.is_owner) {
    window.location.hash = '#/owner';
  }
  setActivated(true);
};
```

**Passo C:** Adicionar rota no segundo `<HashRouter>`:
```tsx
<Route path="/owner" element={<OwnerDashboardScreen />} />
```

**Passo D:** No `runSyncCycle`, pular sync quando `is_owner === true` (o dono não tem dados de fazenda local):
```typescript
const ctx = farmContextService.getContext();
if (ctx?.is_owner) {
  releaseStartup();
  return;
}
```

---

### Tarefa 23 — Esconder aba "Admin" no `SettingsScreen` para não-donos
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `screens/SettingsScreen.tsx`

Linha 674 atualmente mostra o botão Admin para qualquer usuário que passa pelo PinGuard:
```tsx
<button onClick={() => setActiveTab('admin')} ...>Admin</button>
```

Corrigir para mostrar apenas ao dono:
```typescript
const farmContext = farmContextService.getContext();
const isOwner = farmContext?.is_owner === true;

// No JSX:
{isOwner && (
  <button onClick={() => setActiveTab('admin')} ...>Admin</button>
)}
```

> **Nota:** O `AdminPanel` atual (`components/AdminPanel.tsx`) gerencia fazendas, licenças e devices. É o painel certo para o dono. Usuários normais não devem vê-lo.

---

### Tarefa 24 — Atualizar `auth.service.ts` para PIN por funcionário
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `services/auth.service.ts`

Atualmente usa apenas `VITE_ADMIN_PIN` global. Novo comportamento: verificar primeiro o `admin_pin` do contexto do funcionário ativo.

```typescript
import { farmContextService } from './farm-context.service';

const GLOBAL_PIN = import.meta.env.VITE_ADMIN_PIN || '1234';

export const authService = {
  login: (pin: string): boolean => {
    const ctx = farmContextService.getContext();
    // PIN específico do funcionário tem prioridade
    const validPin = ctx?.admin_pin || GLOBAL_PIN;
    if (pin === validPin) {
      localStorage.setItem(AUTH_KEY, 'true');
      return true;
    }
    return false;
  },
  // ... logout e isAuthenticated permanecem iguais
};
```

---

### Tarefa 25 — SQL Migration: adicionar colunas em `employees` e inserir SANDRO
**Status: ✅ Concluído no Supabase Gestão Rural Teste em 2026-05-24**
**Arquivo versionado:** `supabase/migrations/202605240001_employee_admin_pin.sql`

O que foi aplicado:
- `employees.is_admin boolean default false`
- `employees.admin_pin text`
- `SANDRO` marcado como `Administrador`, `is_admin = true` e PIN definido.
- `notify pgrst, 'reload schema'` para a API REST enxergar as colunas novas.

Verificação executada:
- `SANDRO_ROWS=1`
- `role=Administrador`
- `is_admin=True`
- `pin_set=True`
- `farm_id=e6ba88a9-9a59-4a13-8d4d-bf4d914acf90`

---

---

# FASE 4 — CORREÇÃO DE DADOS LOCAIS

> **Status: ✅ CONCLUÍDA**

---

### Tarefa 27 — Startup migration para re-keying de IDs locais (Bug 8 complemento)
**Status: ✅ Concluído nesta sessão**
**Arquivo:** `services/db.service.ts`, `App.tsx`

Como descrito no Bug 8, dispositivos já instalados têm registros `milk_daily` e `daily_metrics` com o formato de ID antigo (sem `farm_id` prefix). Após a correção do Bug 8, o app passa a usar IDs novos — mas os registros antigos continuam com IDs velhos no banco local, causando duplicatas.

**Implementar em `db.service.ts`:**

```typescript
export async function migrateLocalIds(): Promise<void> {
  const FLAG = 'local_id_migration_farm_prefix_v1';
  try { if (localStorage.getItem(FLAG)) return; } catch {}

  try {
    const farmId = farmContextService.getFarmId();
    if (!farmId) return; // não migra sem contexto

    const now = nowISO();

    // — Migrar milk_daily —
    const milkData = await localdb.getAll<any>('milk_daily');
    let milkMigrated = 0;
    for (const row of milkData) {
      if (!row.farm_id || !row.date) continue;
      const oldId = row.date;
      const newId = `${row.farm_id}_${row.date}`;
      const existing = await localdb.getRawById('milk_daily', oldId);
      if (!existing) continue; // já foi migrado ou não existe com ID antigo
      await localdb.put('milk_daily', { id: newId, data: row, updated_at: now, synced: existing.synced });
      await localdb.delete('milk_daily', oldId);
      milkMigrated++;
    }

    // — Migrar daily_metrics —
    const metricsData = await localdb.getAll<any>('daily_metrics');
    let metricsMigrated = 0;
    for (const row of metricsData) {
      if (!row.farm_id || !row.date || !row.type) continue;
      const oldId = `${row.date}_${row.type}`;
      const newId = `${row.farm_id}_${row.date}_${row.type}`;
      const existing = await localdb.getRawById('daily_metrics', oldId);
      if (!existing) continue;
      await localdb.put('daily_metrics', { id: newId, data: row, updated_at: now, synced: existing.synced });
      await localdb.delete('daily_metrics', oldId);
      metricsMigrated++;
    }

    if (milkMigrated > 0 || metricsMigrated > 0) {
      console.log(`[Migration] Re-keyed: ${milkMigrated} milk_daily + ${metricsMigrated} daily_metrics`);
    }
    localStorage.setItem(FLAG, 'true');
  } catch (e) {
    console.error('[Migration] Erro na migração de IDs locais:', e);
  }
}
```

**Chamar em `App.tsx`** dentro do `runSyncCycle`, antes do `refreshFromServer`:
```typescript
await db.migrateLocalIds(); // ← adicionar antes do refreshFromServer
await db.refreshFromServer();
```

**Exportar via objeto `db`:**
```typescript
export const db = {
  migrateLocalIds,
  // ... demais métodos
};
```

---

### Tarefa 28 — Adicionar `farm_monthly_stats` ao schema SQLite nativo (Android)
**Arquivo:** `services/localdb.native.ts`
**Status: 🔄 Não requer código — verificar no Android**

O Bug 1 já adicionou `farm_monthly_stats` ao schema Dexie (web), mas o schema SQLite nativo (Android) ainda não tem essa tabela. Isso é transparente no kv_store (qualquer tabela pode ser inserida com `table_name`), mas a tabela não tem índice adequado para buscas eficientes.

Para o nativo (SQLite), o kv_store já suporta qualquer tableName como string — não precisa de DDL específico. A tabela `farm_monthly_stats` funciona via `table_name = 'farm_monthly_stats'` no kv_store. **Verificar em Android se as queries funcionam corretamente.**

> Se houver erros no Android, confirmar que `localdb.getAll('farm_monthly_stats')` retorna dados corretos no dispositivo.

---

### Tarefa 33 — SQL Migration: trocar constraints globais por constraints compostas com `farm_id`
**Status: ✅ Concluído — aplicado no Supabase Gestão Rural Teste em 2026-05-24**
**Arquivos:** `supabase/migrations/202605240002_multi_farm_conflict_keys.sql` e `202605240003_settings_conflict_key.sql`

#### Causa raiz
O schema Supabase foi criado no modelo "um banco por fazenda" — cada tabela tinha constraints de unicidade globais sem incluir `farm_id`:
- `milk_daily(date)` — impedia duas fazendas de registrarem leite no mesmo dia
- `daily_metrics(date, type)` — misturava lactação/descarte/nascimento entre fazendas quando a data era igual
- `farm_monthly_stats(monthKey)` — stats mensais globais sem separação por fazenda
- `sectors(name)` — setor "Ordenha" existia em apenas uma fazenda no banco
- `ui_config(id)` e `farm_settings(id)` — configurações globais, não por fazenda

**Consequência prática:** ao tentar sincronizar leite do dia 22 de uma segunda fazenda, o Supabase retornava erro de constraint `UNIQUE violation` — o dado nunca chegava ao servidor.

#### Correção (migration 202605240002)
Substituir cada constraint global por constraint composta com `farm_id`, **sem DROP TABLE, sem TRUNCATE, sem DROP COLUMN**. O script é idempotente via `IF NOT EXISTS`:

| Tabela | Constraint antiga | Constraint nova |
|---|---|---|
| `milk_daily` | `PRIMARY KEY (date)` | `UNIQUE (farm_id, date)` |
| `daily_metrics` | `PRIMARY KEY (date, type)` | `UNIQUE (farm_id, date, type)` |
| `farm_monthly_stats` | `PRIMARY KEY (monthKey)` | `UNIQUE (farm_id, "monthKey")` |
| `sectors` | `UNIQUE (name)` | `UNIQUE (farm_id, name)` |
| `ui_config` | `PRIMARY KEY (id)` | `UNIQUE (farm_id, id)` |
| `farm_settings` | `PRIMARY KEY (id)` | `UNIQUE (farm_id, id)` |

Índices compostos também criados para performance de query por `farm_id`.

#### Ajuste no sync (sync.service.ts)
A função `upsertWithConflictFallback()` foi adicionada para lidar com o período de transição — se o banco ainda tiver a constraint antiga (schema legado), tenta upsert pelo conflito composto, e em caso de erro 42P10 (constraint inválida), faz fallback para upsert simples. Isso garante compatibilidade com bancos que ainda não rodaram a migration.

#### Migration 202605240003
No-op seguro para bancos que tenham uma tabela `public.settings` separada (algumas versões antigas do app). Mesma lógica: troca `PRIMARY KEY (id)` por `UNIQUE (farm_id, id)` se a tabela existir.

---

---

# FASE 6 — BUGS ADICIONAIS (Revisão Pente-Fino 2026-05-24)

> **Status: ✅ Bugs críticos corrigidos | ⚠️ Menores documentados**

---

### Bug 34 — `currentFarmId` não declarado em `smartRead`
**Arquivo:** `services/db.service.ts`
**Status: ✅ Corrigido nesta sessão**

#### Causa raiz
A reescrita do `smartRead` (stale-while-revalidate) usava `currentFarmId` no bloco de fallback (linha ~406) mas não declarava a variável na função. Erro TypeScript `TS2304: Cannot find name 'currentFarmId'`.

#### Correção
Adicionado `const currentFarmId = farmContextService.getFarmId();` no início da função `smartRead`, logo antes do `readLocal`.

---

### Bug 35 — `ListAnomaliesScreen` trava com tela vazia em toda navegação
**Arquivo:** `screens/ListAnomaliesScreen.tsx`
**Status: ✅ Corrigido nesta sessão**

#### Causa raiz
No `useEffect` de montagem, `loadData(true)` chamava `db.forceRefreshTable('anomalies')` de forma **bloqueante** antes de setar qualquer dado nos items. `forceRefreshTable` faz `clearLastRefresh` + full server fetch, ou seja:
- `items = []` no início
- Espera fetch completo (pode ser 1–3s)
- Só então `setItems(data)` → tela mostra dados

Isso causava flash de tela vazia em TODA navegação para a lista (não apenas no startup).

Adicionalmente, o subscriber (`loadData(false)`) era bloqueado pelo `loadingRef.current` enquanto o carregamento de fotos estava em andamento — se o background refresh da `smartRead` finalizasse durante o loading de fotos, a notificação era descartada.

#### Correção
- Separadas `loadData()` (lê items do DB local via `smartRead`) e `loadPhotos()` (carrega URLs)
- Removido `forceRefreshTable` — `smartRead` já faz stale-while-revalidate na primeira leitura da sessão
- Subscriber do `localdb` atualiza items diretamente sem passar pelo `loadingRef`

```typescript
// Antes:
loadData(true)  // bloqueava na tela vazia

// Depois:
loadData()      // smartRead retorna cache local imediatamente
loadPhotos()    // carrega fotos em paralelo, não bloqueia items
```

---

### Bug 36 — Ghost records em `milk_daily`, `daily_metrics` e `farm_monthly_stats`
**Arquivo:** `services/db.service.ts` → função `refreshFromServer`
**Status: ✅ Corrigido nesta sessão**

#### Causa raiz
`refreshFromServer` usava `bulkPut` (additive only) mas **nunca deletava** registros locais `synced=true` que haviam sido deletados no servidor. Para tabelas com `tsField=null` (full-fetch completo), isso causava ghost records que aparecem localmente mas não existem mais no Supabase.

**Exemplo:**
1. Admin deleta entrada de leite do dia 15/05 no Supabase
2. App faz sync → servidor retorna todos os registros EXCETO 15/05
3. `refreshFromServer` ignora a ausência → 15/05 permanece localmente
4. Usuário continua vendo dados incorretos

#### Correção
Adicionado ghost cleanup **após** o `bulkPut` para tabelas full-fetch (`tsField=null`):
- Compara IDs do servidor com IDs locais (filtrados pela fazenda atual)
- Remove localmente apenas registros `synced=true` que o servidor não retornou
- Protege registros `synced=false` (alterações locais pendentes)
- Só roda se o servidor retornou dados (`data.length > 0`) — protege contra wipe por falha silenciosa de query

```typescript
if (!tsField && data.length > 0) {
    const serverIds = new Set(records.map(r => r.id));
    const allLocal = filterByCurrentFarm(tableName, await localdb.getAll<any>(tableName));
    for (const row of allLocal) {
        const localId = localRecordId(tableName, row);
        if (!serverIds.has(localId)) {
            const raw = await localdb.getRawById(tableName, localId);
            if (raw?.synced === true) {
                await localdb.delete(tableName, localId);
            }
        }
    }
}
```

---

### Bug 37 — `closedMonths` sem prefixo de `farm_id` (menor)
**Arquivo:** `screens/AnomalyQuantityScreen.tsx`
**Status: ⚠️ Documentado — impacto apenas em UX, não em dados**

#### Causa raiz
```typescript
localStorage.getItem('closedMonths')  // chave global sem farm_id
localStorage.setItem('closedMonths', ...)
```

A chave de estado "meses fechados" na tela de quantidade de anomalias não usa `farm_id` como prefixo. Em cenário multi-fazenda, ao trocar de fazenda, os meses fechados da fazenda anterior aparecem.

#### Correção sugerida (baixa prioridade)
```typescript
const CLOSED_MONTHS_KEY = `closedMonths_${farmContextService.getFarmId() || 'default'}`;
```

---

### Bug 38 — `refreshFromServer` sem paginação (risco futuro)
**Arquivo:** `services/db.service.ts` → `refreshFromServer`
**Status: ⚠️ Documentado — não afeta dados atuais (470 anomalias < 1000)**

#### Causa raiz
```typescript
const { data, error } = await baseQuery;  // sem .limit() explícito
```

O PostgREST (Supabase) tem um `max_rows` configurável no servidor (padrão: 1000 linhas por query). Com 470 anomalias já no banco, a query funciona. Se o banco crescer para >1000 registros em qualquer tabela, dados serão **silenciosamente truncados** sem erro.

#### Correção sugerida (quando necessário)
Adicionar paginação em `refreshFromServer`:
```typescript
let allData: any[] = [];
let from = 0;
const PAGE = 1000;
while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    allData.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
}
```

---

---

# FASE 5 — BUILD E VALIDAÇÃO

> **Status: ✅ CONCLUÍDA**

---

### Tarefa 29 — Build sem erros TypeScript
**Status: ✅ Concluído — build passou sem erros**
```bash
npm run build
```
Deve completar sem erros. Erros de tipo indicam regressões nas fases anteriores.

---

### Tarefa 30 — Verificação de tipos pura
**Status: ✅ Concluído — zero erros TypeScript**
```bash
npx tsc --noEmit
```
Deve retornar zero erros.

---

### Tarefa 31 — Verificação no DiagnosticScreen
**Status: ⏳ Pendente — requer device/emulador Android**
Abrir o app em um device/emulador Android após o build:
1. Verificar que `farm_id`, `farm_name` e `employee_name` estão corretos
2. Verificar que o outbox está vazio após sync bem-sucedido
3. Verificar contagens locais das tabelas (devem bater com o Supabase)

---

### Tarefa 32 — Gerar APK e testar em device físico
**Status: ⏳ Pendente — migration ja aplicada; falta gerar APK/AAB e testar em aparelho**
```bash
npm run build
npx cap sync
# Abrir Android Studio → Build → Generate Signed Bundle/APK
```
Após instalar o APK:
1. Ativar com código de fazenda real (ex: STARMILK)
2. Verificar que dados dos dias 21/22/23 aparecem corretamente
3. Verificar que anomalias aparece corretamente no gráfico E na lista
4. Testar modo offline: criar anomalia offline → reconectar → verificar sync

---

---

# ORDEM DE EXECUÇÃO RECOMENDADA

```
✅ CONCLUÍDO EM CÓDIGO (Fases 1-6):
  1. Bug 1 — farm_monthly_stats no schema Dexie
  2. Bug 2 — UPDATE/DELETE sem farm_id em milk_daily/daily_metrics (sync.service.ts)
  3. Bug 3 — detecção de conflito offline (getRawById)
  4. Bug 4 — loop infinito em ListAnomaliesScreen
  5. Bug 5 — getUIConfig sobrescrevia customizações
  6. Bug 6 — saveUIConfig com id: 1 (number)
  7. Bug 7 — migrateRaspagemToConforto sem idempotência
  8. Bug 8 — colisão de ID em milk_daily/daily_metrics (composite IDs)
  9. Bug 9 — refreshFromServer + smartRead: configOnlyTables
  10. Bug 10 — filterByCurrentFarm: strict farm_id match
  11. Bug 11 — selectedMonth com farm_id prefix
  12. Bug 12 — DiagnosticScreen hardcoded URLs removidos
  13. Bug 13 — validateAndRepairData chama forceFullRefreshFromServer
  14. Bug 15 — AnomalyQuantityScreen: PIN removido
  15. Tarefa 16/17 — types.ts: is_owner, admin_pin
  16. Tarefa 18 — .env.example VITE_OWNER_CODE
  17. Tarefa 19 — activation.service.ts owner code
  18. Tarefa 20 — ActivationScreen owner flow
  19. Tarefa 21 — OwnerDashboardScreen (novo arquivo)
  20. Tarefa 22 — App.tsx rota /owner + skip sync para owner
  21. Tarefa 23 — SettingsScreen Admin tab escondida para não-donos
  22. Tarefa 24 — auth.service.ts PIN por funcionário
  23. Tarefa 25 — migration employees admin_pin aplicada no Supabase novo
  24. Tarefa 27 — migrateLocalIds() + chamada em App.tsx
  25. Tarefa 33 — migrations 202605240002/202605240003 para constraints multi-fazenda
  26. Tarefas 29/30 — build + tsc: zero erros
  27. Bug 34 — currentFarmId não declarado em smartRead (TS error)
  28. Bug 35 — ListAnomaliesScreen trava vazia em toda navegação (forceRefreshTable removido)
  29. Bug 36 — Ghost records: milk_daily/daily_metrics/farm_monthly_stats (ghost cleanup implementado)

⚠️ DOCUMENTADO, BAIXA PRIORIDADE:
  - Bug 37 — closedMonths sem farm_id prefix (UX, não dados)
  - Bug 38 — refreshFromServer sem paginação (risco >1000 registros)

❌ AINDA PENDENTE (ações manuais):
  - VITE_OWNER_CODE — definido localmente em `.env.local` como valor de teste/dono; nunca commitar
  - Tarefa 28 — verificar farm_monthly_stats no Android
  - Tarefa 31/32 — gerar APK e testar em device físico
```

---

# VARIÁVEIS DE AMBIENTE

| Variável | Uso | Onde configurar |
|---|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase | `.env.local` |
| `VITE_SUPABASE_ANON_KEY` | Chave anônima do Supabase | `.env.local` |
| `VITE_ADMIN_PIN` | PIN admin global (fallback) | `.env.local` |
| `VITE_OWNER_CODE` | Código secreto do dono do app | `.env.local` (nunca commitar) |
| `VITE_ENABLE_SEED_DATA` | Ativa dados demo | `.env.local` |

---

# FLAGS DE MIGRAÇÃO (localStorage)

Estas flags garantem que migrações one-time não rodem mais de uma vez:

| Flag | Significado |
|---|---|
| `migration_raspagem_to_conforto_v1` | Setor Raspagem → Conforto já migrado |
| `metrics_sync_reset_v1` | Timestamps de delta-sync de métricas resetados |
| `error_cleanup_v1` | Erros antigos de sync reativados uma vez |
| `full_refresh_after_supabase_switch_v6` | Carga completa após migração de Supabase/cache |
| `local_id_migration_farm_prefix_v1` | Re-keying de IDs locais com farm_id prefix (✅ implementado em Tarefa 27) |

---

# NOTAS DE ARQUITETURA PARA O DEV

### Por que offline-first com outbox?
O app é usado no campo, frequentemente sem internet. Qualquer dado digitado deve ser salvo imediatamente e sincronizado quando a conexão aparecer.

### Por que `localRecordId` precisa incluir `farm_id`?
O banco local (Dexie/SQLite) é compartilhado no device. Se dois contextos de fazenda diferentes usarem o mesmo device (ex: técnico que acessa múltiplas fazendas), os registros precisam ser distinguíveis pelo ID local. Sem o `farm_id` no ID, um `bulkPut` do servidor sobrescreve registros da outra fazenda.

### Por que `configOnlyTables` aceita `farm_id.is.null` mas data tables não?
Tabelas de config (`ui_config`, `sectors`, `settings`) podem ter registros "globais" sem farm_id como template/fallback. Tabelas de dados operacionais nunca devem ter `farm_id = null` em produção — se têm, é dado legado ou corrompido e não deve aparecer para nenhuma fazenda específica.

### Por que o dono não registra device?
O dono acessa o app para gerenciar, não como funcionário de uma fazenda. Registrar seu device na tabela de devices de uma fazenda específica criaria lixo no banco. O contexto `{ farm_id: 'owner', is_owner: true }` é suficiente para o app saber que está em modo administração.

---

---

# AÇÕES MANUAIS PENDENTES

> Estas ações ainda dependem de valor secreto local ou validação em aparelho físico. O Supabase Gestão Rural Teste já recebeu a migration de admin por funcionário.

---

## Ação 1 — Conferir `VITE_OWNER_CODE` no `.env.local`

**Status:** concluído localmente para teste. O valor real fica apenas em `.env.local` e não deve ser commitado.

**Por que:** Sem este valor, nenhum código digitado na `ActivationScreen` ativará o modo Dono.

Para trocar o código depois, editar apenas `.env.local`, gerar novo build e nunca colocar o valor real no repositório.

---

## Ação 2 — Build + Cap Sync + Gerar APK

Após conferir `VITE_OWNER_CODE`, executar em sequência:

```bash
npm run build       # compila TypeScript + Vite
npx cap sync        # copia dist/ para android/app/src/main/assets/public/
# Abrir Android Studio → Build → Generate Signed Bundle/APK
```

**Testar no device físico:**
1. Ativar com `STARMILK` → selecionar funcionário → verificar que PIN de SANDRO funciona com `1234`
2. Ativar com `SEU_OWNER_CODE` → confirmar que abre `OwnerDashboardScreen`
3. Testar offline: criar anomalia sem internet → reconectar → verificar que sync envia
4. Verificar `DiagnosticScreen` → outbox deve zerar após sync
