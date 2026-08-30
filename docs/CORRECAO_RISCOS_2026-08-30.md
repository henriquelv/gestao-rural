# Correcao dos riscos da validacao final

Data: 30/08/2026
Branch: `fix/auditoria-estabilidade-sync-v2`
Versao Android: `1.0.16-risk-hardening-hotfix` (`versionCode 17`)

## Alteracoes realizadas

1. As telas secundarias passaram a ser carregadas sob demanda. Todos os chunks
   continuam dentro do APK e funcionam sem internet. O bundle inicial caiu de
   809,11 kB para 600,26 kB minificados, reducao de aproximadamente 26%.
2. A midia offline ganhou autorrecuperacao conservadora. Quando um aparelho possui
   uma copia local e o objeto remoto esta comprovadamente ausente, o app envia a
   copia para o mesmo `remotePath` com `upsert: false`. Objetos existentes nunca
   sao sobrescritos e o cache local nunca e apagado.
3. Foi criada a migration incremental
   `202608300001_optimize_operational_sync_cursor.sql`, com indices
   `(farm_id, updated_at, id)` para as cinco tabelas operacionais. Ela nao altera
   dados, constraints ou policies.
4. Cancelamentos esperados de navegacao/reload (`AbortError`) deixaram de ser
   registrados como falha real. Diagnosticos antigos desse tipo sao removidos na
   inicializacao; outros erros continuam registrados normalmente.
5. O roteiro de atualizacao Android agora inicializa o schema SQLite antes de
   inserir os dados de validacao e preserva uma prova reproduzivel do upgrade.
6. O teste de estresse web agora aceita URL configuravel, aquece os chunks antes
   da simulacao offline e sempre restaura a rede ao terminar.

## Validacoes executadas

- `npm test`: 56 testes aprovados em 13 arquivos.
- `npm run lint`: aprovado sem avisos.
- `npm run build`: aprovado.
- Navegacao web: 100 ciclos online/offline, sem erro de runtime.
- APK Android: build concluido e assinatura v1/v2 valida.
- Atualizacao por cima: `1.0.15` para `1.0.16` com o mesmo `firstInstallTime`.
- Dados preservados no upgrade: contexto de fazenda/funcionario, anomalia local,
  leite diario, metrica diaria e tres itens pendentes no outbox.
- Abertura fria offline: onze telas criticas aprovadas, incluindo lista/nova
  anomalia, grafico, comunicados, melhorias, instrucoes e todas as telas de leite.
- Logcat limpo apos o teste final: zero `FATAL`, ANR, erro JS ou excecao Android
  relevante para `com.gestaorural.app`.

## Migration preparada, nao aplicada

Ordem planejada para o ambiente de teste:

1. `202608200001_add_operational_updated_at.sql`
2. `202608300001_optimize_operational_sync_cursor.sql`

As duas foram revisadas: nao possuem `DROP TABLE`, `TRUNCATE`, `DROP COLUMN`,
`DELETE` ou `SET NOT NULL`. Nenhuma migration foi aplicada no Supabase nesta
etapa.

## Midias legadas ausentes

O projeto antigo `lviwvkvkeyzqdcbevaih` nao resolve mais no DNS e os seis arquivos
nao foram encontrados no workspace, Desktop, Downloads ou Documentos. Os registros
e metadados foram preservados. A nova autorrecuperacao consegue restaurar um
arquivo somente se algum aparelho ainda possuir sua copia no cache offline.

## Riscos externos ainda dependentes de ambiente

1. Aplicar e validar as duas migrations primeiro em um projeto Supabase separado.
2. Executar piloto fisico em pelo menos um Android antigo/intermediario; o teste
   disponivel nesta maquina usa API 36. O fallback de WebView antigo evita tela
   branca e orienta a atualizacao do Android System WebView.
3. Fazer um teste remoto completo aparelho A -> servidor -> aparelho B em ambiente
   de teste. A producao permaneceu somente leitura nesta auditoria.
4. Recuperar as seis midias depende de cache de algum aparelho ou backup externo.
5. A assinatura continua sendo a mesma chave debug usada nas versoes distribuidas.
   Troca-la agora impediria instalar por cima. Uma chave release so pode ser
   adotada com um plano separado de migracao/distribuicao.

## APK

- `builds/risk-hardening-hotfix/gestao-rural-1.0.16-risk-hardening-hotfix-debug.apk`
- `C:\Users\henri\Desktop\Gestao-Rural-1.0.16-HOTFIX.apk`
- SHA-256: `46719D95E011C99E6283B7DF73E43F9B84C4138FB9888D8973E5D29599532CBD`
- Package: `com.gestaorural.app`
- Certificado SHA-256:
  `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`

## Supabase

Nenhuma tabela, policy, migration, registro ou objeto de Storage foi alterado no
Supabase durante esta correcao. As consultas aos seis paths ausentes foram somente
leitura.
