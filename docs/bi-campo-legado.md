# BI das fazendas — setembro de 2026

O painel existente do app continua sendo a superfície de entrega. Público: administradores. Fonte externa: Rúmina Insights/Ideagri; apenas endpoints de listagem documentados. Nenhuma alteração no banco externo ou no Supabase foi necessária para esta versão.

## Escopo e leitura

- Entrada própria “Gestão Rural” no menu inicial, exclusiva para administradores; o painel não aparece mais dentro de Ordem de Serviço.
- Fazenda sintética “Gestão Rural”: consolida todas as fazendas retornadas para a conta e permite comparar qualquer indicador entre elas.
- 25 fontes de listagem e 56 indicadores organizados em Rebanho, Leite e tanque, Reprodução, Saúde e manejo e Financeiro.
- Visão geral, catálogo de todos os indicadores, gráficos mensais, composição, rankings, detalhamentos e exportação CSV.
- Financeiro: valores apropriados de receitas/despesas e saldo da fazenda no Ideagri. Não são valores de OS, lucro contábil ou saldo bancário.

Filtro por fazenda e por intervalo mensal entre 1 e 12 meses. O campo `datafilter` é a referência de data da API. O rebanho ativo é posição atual e não é agregado ao histórico mensal. Meses sem medição têm média nula; meses sem eventos em fonte disponível têm contagem zero. Uma fonte indisponível retorna nulo, não zero. Registros fora do intervalo ou sem data de referência são excluídos e tornam a fonte parcial. Falhas e limites de paginação são explicitados.

As médias do período são calculadas sobre as medições individuais. Financeiro soma `valor_apropriado`, preservando linhas de apropriação por centro de custo. A ausência de um valor financeiro impede a apresentação do total como completo. Crias sem quantidade não são inferidas como uma cria. O percentual de prenhez não substitui o indicador zootécnico de prenhez do rebanho.

Produção de leite é exibida por controle e também pelas destinações documentadas: cliente, funcionários, recria e outros. Não é inferido um total quando a origem não fornece uma regra segura de composição.

## Verificação

- `node scripts/bi-model-test.mjs`: virada de ano, datas inválidas, média ponderada por medições, ausência versus zero, reconciliação financeira, quantidades ausentes e detalhamentos.
- `node scripts/bi-production-check.mjs`: valida produção, acesso administrativo, bloqueio de escrita, 25 fontes, 56 indicadores e consolidado das fazendas. Nunca imprime credenciais ou registros brutos.
- `npm run build`: TypeScript e pacote web.

Cache de dados agregado por perfil, fazenda e intervalo; não restaura cache após troca de usuário. CSV inclui fonte, situação, período e data da consulta. A fonte nunca é alterada pela exportação.

Documentação da origem: https://ruminainsights.rumina.com.br/api-docs/
