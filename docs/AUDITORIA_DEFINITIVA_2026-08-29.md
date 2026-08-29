# Auditoria definitiva de estabilidade - 2026-08-29

## Escopo e garantia operacional

- Branch: `fix/auditoria-estabilidade-sync-v2`.
- Build auditada: `1.0.15-definitive-audit-hotfix` (`versionCode 16`).
- Project Ref esperado: `vocnftkhnrfnbfvpnqtb`.
- Application ID: `com.gestaorural.app`.
- A auditoria remota foi estritamente somente leitura.
- Nenhuma migration, policy, tabela, linha ou objeto do Storage foi alterado.
- O banco local e o outbox não foram limpos.

## Resultado do banco atual

Leitura feita com a chave anon configurada no app, usando paginação de 500 linhas:

| Tabela | Registros visíveis |
| --- | ---: |
| anomalies | 888 |
| notices | 85 |
| improvements | 17 |
| instructions | 27 |
| farm_docs | 15 |
| milk_daily | 245 |
| daily_metrics | 430 |
| farm_monthly_stats | 0 |

- Fazenda ativa: `starmilk`.
- Funcionários ativos: 48.
- Dispositivos: 99, todos ativos e sem `device_id` duplicado.
- Licença: uma licença ativa.
- Nenhuma duplicidade de ID nas anomalias.
- Nenhuma data inválida nas anomalias.
- Nenhuma duplicidade de data em `milk_daily` ou de data/tipo em `daily_metrics`.
- Não há anomalias de janeiro de 2026 no banco atual. O gráfico mostra janeiro com zero, conforme os dados reais.
- Anomalias de 2026: fev 2, mar 134, abr 165, mai 165, jun 143, jul 153 e ago 126.

## Problemas corrigidos

1. A lista fixa de 39 funcionários foi removida do fallback offline. Agora funcionários vêm somente do cache e servidor da fazenda ativa.
2. Toda mídia com `remotePath` passa a reconstruir `remoteUrl` usando o Supabase desta build. URLs antigas não são mais priorizadas em visualização/download.
3. O menu padrão é renderizado imediatamente, antes da ponte SQLite, e depois recebe a configuração local/remota. Isso elimina a espera em `Preparando o menu` em aparelhos lentos ou offline.
4. Edição de leite e métricas agora também rejeita valores negativos.
5. O seed opcional deixou de excluir instruções antigas; ele é estritamente aditivo.
6. O lockfile foi atualizado para não reinstalar versões transitivas com alertas altos já corrigidos.
7. Foi adicionada trava por `VITE_EXPECTED_SUPABASE_REF`. Uma build configurada para outro projeto fica com cliente remoto inerte e preserva o cache local.
8. A recuperação de órfãos deixou de transformar seeds antigos de menu, configurações, setores e funcionários em pendências. Ela agora cobre somente dados operacionais criados pelo usuário.
9. O smoke automatizado foi atualizado para Chrome atual e passou a validar que leite/métricas locais pendentes sobrevivem a uma reconciliação remota vazia.

## Sincronização e dados locais

- Escrita local e criação do outbox são atômicas no SQLite/IndexedDB.
- O outbox só é removido depois do sucesso remoto.
- Erros ficam preservados para diagnóstico e retry.
- Payloads legados recebem `farm_id`, `employee_id`, `employee_name` e `device_id` antes do envio quando o contexto atual permite.
- Alterações locais pendentes vencem a carga remota durante conflitos.
- Falha no upload de mídia não impede o registro textual de subir.
- Mídia pendente permanece no outbox com `[MEDIA_PENDING]` e é reprocessada automaticamente.
- Carga remota usa paginação; não existe limite de 20, 100 ou 1.000 anomalias na lista/gráfico.
- Listas e gráficos assinam mudanças do banco local e atualizam sem exigir o botão manual de sincronização.

## Storage e offline

O script `scripts/read-only-storage-audit.mjs` verificou todas as referências com leitura de apenas um byte:

- Referências de mídia: 406.
- Disponíveis no bucket atual: 400.
- Indisponíveis: 6.
- Paths legados: 215.
- Paths `farms/{farm_id}/...`: 191.
- Uploads pendentes no banco remoto: 0.
- Mídias sem fonte remota: 0.
- URLs antigas em metadados: 215; todas possuem `remotePath`, e o app agora reconstrói a URL atual.

Objetos ausentes:

- `anomalies/6076fdf2-1de2-4edf-8328-470b25e187a3/9841a21f-a027-497a-96a8-e717c101b7b7.jpeg`
- `anomalies/7bce04ca-1f94-4bf9-9031-69c7025a12a4/1bd32115-4c63-4f6a-b61a-b50b74e6f1a8.jpeg`
- `improvements/150208f1-d92e-4235-b359-1153e5687ed1/42e05476-d33f-41eb-adf9-3cb0f921aedd.jpeg`
- `improvements/18e93477-651b-4d97-bb8a-9b418d1dee1e/0812ec29-3f89-415c-9dd0-5e2aa9dda2c4.jpeg`
- `improvements/84f82357-28b5-4fd0-861c-6ed85a5d248f/c264bcac-5178-418c-998f-e8f755fe6191.jpeg`
- `improvements/bd3b914a-1fb0-4753-b01b-ec9bfbbabd4d/3a7ab8a6-05d3-4715-8444-54e50ab0b6cc.jpeg`

O host do projeto antigo `lviwvkvkeyzqdcbevaih.supabase.co` não resolve mais no DNS. Esses seis arquivos só podem ser recuperados de cache de algum aparelho, backup externo ou cópia local anterior. O app exibe placeholder sem derrubar a tela.

## Migration pendente

O banco atual ainda não possui `updated_at` em `anomalies`, `notices`, `improvements`, `instructions` e `farm_docs`. O app possui fallback compatível e faz reconciliação completa, mas isso aumenta tráfego e tempo de atualização.

A migration aditiva já preparada é:

`supabase/migrations/202608200001_add_operational_updated_at.sql`

Ela não foi aplicada nesta auditoria. Deve ser validada em cópia de teste e só depois autorizada no banco usado pelos clientes.

## Riscos restantes

1. As migrations atuais deixam policies amplas para `anon`. O app filtra por `farm_id`, mas isso não constitui isolamento forte contra um cliente malicioso. Multi-fazenda seguro exige autenticação real e RLS baseada em identidade, ou RPC/Edge Function validada no servidor.
2. `VITE_OWNER_CODE` e o PIN global fazem parte do bundle frontend. Eles controlam interface, não são segredo ou autorização forte de backend.
3. O npm mantém dois alertas moderados no React Router 6; a correção automática exige React Router 7 e mudança incompatível. Os alertas altos de produção foram eliminados do lockfile.
4. Seis mídias legadas estão ausentes no Storage e não podem ser reconstruídas pelo código.
5. Compatibilidade foi coberta por build, testes e emulador, mas nenhum software pode garantir comportamento em todo aparelho físico sem uma matriz real de Android/WebView.

## Instalação sem perda local

- Instalar o APK por cima da versão existente.
- Não desinstalar o aplicativo antes da atualização.
- Confirmar o mesmo `applicationId` e a mesma assinatura.
- Depois de abrir, aguardar a reconciliação e conferir Configurações > Diagnóstico.
- Se houver pendências, usar `Re-tentar erros` e `Sincronizar agora`; nunca limpar dados do app.

## Verificações

- `npm run lint`: aprovado.
- `npm test`: 10 arquivos e 43 testes aprovados.
- Smoke local isolado: 650 anomalias, listas de comunicados/instruções/melhorias, troca de funcionário, PIN, leite pendente e rota inválida aprovados sem erro JavaScript.
- `npm run build`: aprovado; permanece apenas o aviso não bloqueante do chunk principal de 809,11 kB.
- `npx cap sync android`: aprovado.
- Gradle `assembleDebug`: aprovado.
- `npm audit --omit=dev --audit-level=high`: nenhum alerta alto de produção; 2 moderados no React Router 6.
- Auditoria de dados e Storage: somente leitura.

## APK final

- Arquivo: `builds/definitive-audit-hotfix/gestao-rural-1.0.15-definitive-audit-hotfix-debug.apk`.
- Tamanho: 19.067.922 bytes.
- SHA-256: `FA0D1F184B41ACB5EAC0CB3A83228B2C06B231500A40BE53C6BAD12CC8B95FAB`.
- Assinatura SHA-256: `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`.
- Assinaturas APK v1 e v2: válidas.
- Atualização por `adb install -r`: preservou o mesmo pacote, o horário da primeira instalação e o arquivo SQLite local.

O AVD Android 16 usado no teste apresentou ANR em processos do próprio sistema (`com.android.phone`, Dialer e armazenamento) depois de um cold boot. Não houve crash atribuído a `com.gestaorural.app`, mas esse estado do emulador impediu uma segunda inspeção visual nativa completa do APK final. A versão imediatamente anterior do mesmo código abriu Home/lista/cadastro offline no AVD, e a alteração final ficou coberta por teste unitário, smoke web isolado, build e Gradle. Um piloto em aparelho físico continua obrigatório antes de distribuir para todos.
