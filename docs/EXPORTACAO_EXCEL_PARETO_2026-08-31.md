# Exportacao Excel e Pareto

Data: 31/08/2026
Versao: `1.0.17-export-pareto` (`versionCode 18`)
Branch: `fix/auditoria-estabilidade-sync-v2`

## Alteracoes

1. Exportacao Excel real no formato `.xlsx`, sem renomear arquivos CSV.
2. Planilha de anomalias com duas abas:
   - `Anomalias`: data, setor, ocorrencia, solucao, status e responsavel;
   - `Pareto por setor`: ranking, quantidade, participacao, percentual acumulado
     e faixa A/B/C.
3. Exportacao CSV mantida para integracoes simples, com protecao contra CSV
   injection em textos iniciados por formula.
4. Planilha de leite com as abas `Registros` e `Resumo anual`, incluindo os
   doze meses, totais, medias e dias registrados.
5. Seletor mobile padronizado para escolher Excel ou CSV.
6. Android salva em `Downloads/Gestao Rural` e cria notificacao clicavel para
   abrir o arquivo em um aplicativo compativel.
7. Arquivos com o mesmo nome sao preservados; o Android adiciona um sufixo em
   vez de sobrescrever o download anterior.

## Validacao

- `npm test`: 60 testes aprovados em 14 arquivos.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `gradlew assembleDebug`: aprovado.
- Atualizacao `1.0.16` para `1.0.17` instalada por cima com o mesmo
  `firstInstallTime`.
- Contexto, registros locais e tres itens pendentes no outbox preservados.
- Onze telas criticas abertas no smoke test Android.
- Download `.xlsx` de anomalias validado no Android.
- Download `.csv` de anomalias validado no Android.
- Download `.xlsx` de leite validado com resumo de janeiro a dezembro.
- Notificacao validada com `contentIntent` para abertura do arquivo.
- Nenhum erro de runtime registrado durante as exportacoes.

## APK

- `C:\Users\henri\Desktop\Gestao-Rural-1.0.17-EXCEL-PARETO.apk`
- SHA-256: `D9CB3C7D1DDD9B465CD39973E38537B81307199C33E35F1528415687CB0076C4`
- Package: `com.gestaorural.app`
- Certificado SHA-256:
  `9bad6fdd00abd4512029eda8948583c6560cfe7cfe69660353c45f8e5fbabf52`

Nenhuma tabela, policy, migration, registro ou arquivo de Storage foi alterado
no Supabase durante esta entrega.
