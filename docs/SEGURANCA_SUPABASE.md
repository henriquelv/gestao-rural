# Seguranca Supabase

## Estado atual

As policies historicas permitem leitura/escrita para `anon` e `authenticated`. Isso e compatível com o app interno atual, mas nao isola fazendas de forma forte.

## Esta etapa

Nao aplicamos RLS agressivo. Primeiro:

1. App envia `farm_id`.
2. App valida fazenda/licenca/dispositivo.
3. Dados antigos continuam visiveis.
4. Teste confirma que nada quebrou.

## Proxima etapa de seguranca

Depois de validar:

- Avaliar login real por usuario.
- Ou usar RPCs/Edge Functions para validar codigo, licenca e dispositivo sem expor operacoes sensiveis.
- Criar policies por fazenda.
- Evitar qualquer `service_role` no frontend.

## Regras

- Nunca commitar `.env.local`.
- Nunca usar `service_role` no frontend.
- Nao imprimir chaves em logs.
- Bloquear sync quando fazenda, funcionario, licenca ou dispositivo estiverem bloqueados.
