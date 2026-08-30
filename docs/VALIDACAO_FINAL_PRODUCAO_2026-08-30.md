# Validacao final de producao - Gestao Rural

Data: 30/08/2026

Branch: `fix/auditoria-estabilidade-sync-v2`

Baseline antes desta bateria: `126c9530dabc48ba0d00122f072ae65865b1a65b`

Projeto Supabase lido: `vocnftkhnrfnbfvpnqtb`

Modo remoto: estritamente somente leitura

## Veredito

**APTO PARA PILOTO EM APARELHO FISICO.**

Os testes automatizados criticos passaram. Esta conclusao nao equivale a dizer que
o aplicativo esta "100% garantido". O piloto ainda precisa incluir ao menos um
Android antigo e um intermediario reais, alem de sincronizacao entre dois aparelhos
em um ambiente remoto no qual seja permitido criar dados de teste.

Nenhuma migration foi aplicada. Nenhum `insert`, `update`, `delete`, `upsert` ou
upload foi executado no Supabase atual. As escritas desta auditoria ocorreram apenas
nos bancos locais descartaveis do navegador e do emulador.

## Resultado consolidado

| Teste | Execucoes | Passou | Falhou | Evidencia |
| ----- | --------: | -----: | -----: | --------- |
| Cold start/tela branca | 23 | 23 | 0 | 20 `force-stop` offline, transporte online bloqueado, queda durante abertura e retorno depois da Home |
| Compatibilidade WebView | 3 | 3 | 0 | Android 16/API 36 real + 2 testes VM de ordem/fallback e polyfills; Android antigo/intermediario fisico pendente |
| Leite servidor -> SQLite -> tela | 20 amostras | 20 | 0 | Servidor e SQLite com 246; 20 datas de 2025-12 a 2026-08 visiveis com valores identicos |
| Leite em cold start offline | 10 | 10 | 0 | 246 registros em todos os ciclos; 28/08 = 38.221 L sempre visivel |
| Dois aparelhos/conflito | 1 simulacao | 1 | 0 | Chave `farm_id + date`; alteracao `synced=false` de B prevaleceu sobre resposta remota simulada |
| Anomalias reais e carga | 6 conjuntos | 6 | 0 | 893 reais + datasets 10, 500, 650, 1.001 e 2.000, sem corte em 1.000 |
| Corrida SQLite | 370 operacoes | 370 | 0 | 250 gravacoes concorrentes atomicas + lote nativo de 120; uma inicializacao/conexao |
| Interrupcao de escrita/midia | 4 cenarios controlados | 4 | 0 | rollback pre-commit, falha do outbox, reconexao e texto independente da midia |
| Atualizacao 1.0.14 -> 1.0.15 | 1 | 1 | 0 | `adb install -r`, mesmo package/certificado/firstInstallTime, contexto/SQLite/outbox preservados |
| Background/resume | 20 | 20 | 0 | Mesmo PID, mesmas contagens, nenhuma excecao ou sync concorrente visivel |
| Stress de navegacao/rede | 100 | 100 | 0 | Home, anomalias, cadastro, grafico, leite e alternancia de rede em perfil isolado |
| Instrumentation Android | 1 | 1 | 0 | Package confirmado como `com.gestaorural.app` em Android 16/API 36 |
| Unitarios/integracao | 54 | 54 | 0 | 12 arquivos de teste |

## Criterios pedidos

- Cold starts: **20/20**.
- Cold starts offline com leite real em cache: **10/10**.
- Resume/background: **20/20**.
- Anomalias servidor/SQLite/tela: **iguais, 893/893/893** na leitura de 30/08/2026.
- Leite servidor/SQLite/tela: **iguais, 246/246/246**.
- Atualizacao preservou SQLite: **SIM**.
- Atualizacao preservou outbox: **SIM**.
- Atualizacao preservou fazenda e funcionario: **SIM**.
- Runtime exceptions na bateria final: **0**.
- Crashes atribuidos ao pacote: **0**.
- ANRs atribuidos ao pacote: **0**.
- Tela branca detectada: **0**.
- `last_runtime_error`: **nulo**.
- Erros `database not open`, `connection already exists` ou `database is locked`
  depois da correcao dos verificadores: **0**.

## Testes detalhados

### Cold start, rede e retomada

Foram executados 20 ciclos com:

```text
adb shell am force-stop com.gestaorural.app
adb shell am start -W -n com.gestaorural.app/.MainActivity
```

Em todos os ciclos a Home teve conteudo, o contexto continuou disponivel, o outbox
nao mudou e `Runtime.exceptionThrown` ficou vazio. O Logcat final nao apresentou
crash, ANR ou erro SQLite do pacote.

O APK final aponta para o projeto atual. Para testar a transicao de rede sem escrever
em producao, o emulador usou um proxy local sem servidor (`127.0.0.1:9`). Foram
validados: transporte online, internet desligada 500 ms depois da abertura e retorno
do estado online depois da Home. A interface permaneceu funcional e os dados locais
nao foram removidos.

### WebView e Android

- `minSdkVersion`: 22.
- Android realmente executado: Android 16/API 36.
- Android System WebView executado: `134.0.6998.135`.
- `compatibility.js` aparece antes do bundle de modulo em `index.html`.
- Existe mensagem `nomodule` para WebView sem suporte a modulos.
- Polyfills exercitados apos remocao das APIs nativas:
  `Object.fromEntries`, `Promise.allSettled`, `Promise.finally`, `Array.flatMap`,
  `String.matchAll`, `structuredClone`, `AbortController` e `queueMicrotask`.

A maquina possui somente a imagem API 36. Nao houve execucao real em Android antigo
ou intermediario; isso deve ser coberto no piloto fisico. O teste VM prova os
polyfills, mas nao substitui uma WebView antiga real.

### Leite Diario real

Auditoria somente leitura:

- Total: 246.
- Menor data: 08/12/2025.
- Maior data: 28/08/2026.
- Datas duplicadas: 0.
- Valores invalidos: 0.

Totais por mes:

| Mes | Dias | Total (L) | Media (L) |
| --- | ---: | ---: | ---: |
| 2025-12 | 24 | 37.726 | 1.571,92 |
| 2026-01 | 13 | 390.200 | 30.015,38 |
| 2026-02 | 28 | 840.463 | 30.016,54 |
| 2026-03 | 31 | 964.435 | 31.110,81 |
| 2026-04 | 30 | 976.244 | 32.541,47 |
| 2026-05 | 31 | 1.040.676 | 33.570,19 |
| 2026-06 | 30 | 1.036.524 | 34.550,80 |
| 2026-07 | 31 | 1.088.291 | 35.106,16 |
| 2026-08 | 28 | 1.036.288 | 37.010,29 |

As 20 amostras distribuiram-se por todos esses meses. O carregamento offline por
mes levou entre aproximadamente 0,6 s e 2,7 s no emulador sobrecarregado. Durante
esse intervalo a tela mostra `Atualizando dados...`; depois, todas as datas e litros
foram encontrados na tela.

### Anomalias

Na leitura final:

- Servidor: 893.
- SQLite: 893.
- Total informado pela tela: 893.
- Datas invalidas: 0.
- Duplicidades por data/setor/descricao: 0.
- Distribuicao: fev 2, mar 134, abr 165, mai 165, jun 143, jul 153, ago 131.
- Janeiro tem zero no servidor. O grafico exibe janeiro com 0; isso nao e erro de carga.

Os conjuntos locais 10, 500, 650, 1.001 e 2.000 passaram. A lista informou o total
completo, manteve paginacao visivel, aceitou filtros e o Pareto apresentou setor,
acumulado e exportacao.

### SQLite, conflito e interrupcao

O teste nativo disparou 250 gravacoes concorrentes de registro + outbox. A conexao,
abertura e schema foram inicializados uma vez. Quando o outbox falhou, a transacao
inteira foi revertida. Uma transacao simulada como interrompida foi revertida antes
de publicar a conexao.

A reconciliacao simulada A/B confirmou:

1. B recebe a alteracao de leite sincronizada por A quando nao tem pendencia.
2. B edita offline e fica `synced=false`.
3. Uma resposta remota posterior nao sobrescreve o valor pendente de B.

O teste de midia confirmou que falha de upload nao impede o `upsert` textual. O item
fica com `[MEDIA_PENDING]`, o outbox e preservado e o registro local continua
`synced=false` para nova tentativa.

### Atualizacao por cima

- APK anterior: 1.0.14, versionCode 15.
- APK final: 1.0.15, versionCode 16.
- Package nos dois: `com.gestaorural.app`.
- Certificado SHA-256 nos dois:
  `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`.
- `firstInstallTime` antes/depois: `2026-08-30 15:51:25`.
- Resultado do `adb install -r`: `Success`.
- Preservados: uma anomalia, um leite, uma metrica, tres itens operacionais de
  outbox, fazenda, funcionario e dispositivo.

O `connectedDebugAndroidTest` desinstala o alvo ao terminar e, por isso, limpa o
perfil do emulador. A prova de atualizacao foi refeita depois do instrumentation e
nenhum teste que desinstala/limpa o app foi executado depois dela.

## Auditoria remota somente leitura

Contagens finais:

| Tabela | Registros |
| --- | ---: |
| anomalies | 893 |
| notices | 86 |
| improvements | 17 |
| instructions | 27 |
| farm_docs | 15 |
| milk_daily | 246 |
| daily_metrics | 435 |
| farm_monthly_stats | 0 |
| employees ativos | 48 |
| devices ativos | 101 |

Fazenda e licenca estavam `active`. Nao existem registros visiveis fora da fazenda
atual nas tabelas auditadas.

Storage/media:

- Referencias: 412.
- Disponiveis: 406.
- Indisponiveis: 6.
- Paths legados: 215.
- Paths `farms/{farm_id}/...`: 197.
- Midias pendentes sem `remotePath`: 0.

Os seis objetos ausentes sao paths legados: duas anomalias e quatro melhorias. A
auditoria nao os removeu nem alterou metadados.

## Riscos restantes

1. **Seis midias legadas ausentes no Storage.** O metadado existe, mas o objeto nao.
   O app deve mostrar placeholder; recuperar a imagem exige uma copia externa.
2. **Android antigo/intermediario nao executado fisicamente.** O minSdk e os
   polyfills foram validados, mas o piloto deve incluir esses aparelhos.
3. **Sync remoto A -> servidor -> B nao foi escrito.** Proibido pela regra de nao
   alterar producao. O conflito foi testado localmente e o sync por mocks.
4. **Cinco tabelas operacionais nao possuem `updated_at`.** O servidor retorna
   `42703` para esse cursor em `anomalies`, `notices`, `improvements`, `instructions`
   e `farm_docs`. O app detecta schema legado e usa carga completa; e seguro, mas
   menos eficiente. A migration existente nao foi aplicada.
5. **Metadados legados incompletos.** Das 893 anomalias, 398 nao possuem
   `employee_id` e 666 nao possuem `device_id`; `employee_name` esta presente. O
   app mantem compatibilidade e nao deve inventar autoria retroativa.
6. **APK assinado como debug.** Ele atualiza as builds anteriores porque usa o mesmo
   certificado debug, mas uma distribuicao formal deve definir e proteger uma chave
   release. Trocar o certificado quebra atualizacao por cima.
7. **Bundle principal grande.** 809,11 kB minificado (220,46 kB gzip). Nao quebrou
   os testes, mas e risco de tempo de parse em celulares muito lentos.

## Comandos principais executados

```powershell
npm test
npm run lint
npm run build
node scripts/read-only-data-audit.mjs
node scripts/read-only-storage-audit.mjs
node scripts/read-only-native-cache-screen-validation.mjs
node scripts/native-readonly-smoke-cdp.mjs
node scripts/stress-navigation-cdp.mjs
npx cap sync android
cd android
.\gradlew.bat connectedDebugAndroidTest
.\gradlew.bat assembleDebug
adb install -r <apk-final>
```

Para as cargas de anomalias, `SMOKE_ANOMALY_COUNT` recebeu: `10`, `500`, `650`,
`1001` e `2000`.

## Testes e arquivos adicionados

- `services/localdb.native.test.ts`: concorrencia, atomicidade e rollback.
- `services/sync.service.test.ts`: texto independente de falha de midia.
- `scripts/native-startup-check-cdp.mjs`: cold start e leitura de SQLite/outbox.
- `scripts/native-milk-offline-check-cdp.mjs`: leite real em cold start offline.
- `scripts/native-update-validation-cdp.mjs`: dados antes/depois de `adb install -r`.
- `scripts/read-only-native-cache-screen-validation.mjs`: servidor -> SQLite -> tela.
- `scripts/stress-navigation-cdp.mjs`: 100 ciclos de navegacao/rede.
- Testes ampliados em `runtime-compat`, `anomaly-months` e `data-integrity`.
- Instrumentation corrigido para `com.gestaorural.app`.

`NativeFarmDatabase` passou a ser exportada somente para permitir o teste direto da
classe. Nao houve alteracao de sua logica de producao nesta bateria.

## APK final

- Arquivo no repositorio local:
  `builds/final-production-validation/gestao-rural-1.0.15-final-production-validation-debug.apk`
- Copia curta para compartilhamento:
  `C:\Users\henri\Desktop\Gestao-Rural-1.0.15-FINAL.apk`
- Tamanho: 19.067.922 bytes.
- SHA-256: `fa0d1f184b41acb5eac0cb3a83228b2c06b231500a40be53c6bad12cc8b95fab`.
- Package: `com.gestaorural.app`.
- Version: `1.0.15-definitive-audit-hotfix` (`versionCode=16`).
- Assinatura: APK Signature Scheme v1 e v2 validas.
