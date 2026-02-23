# Setup do Supabase (Gestão Rural)

Você me passou:
- Project ID: lviwvkvkeyzqdcbevaih
- URL: https://lviwvkvkeyzqdcbevaih.supabase.co
- Anon key: (está em .env.local)

## 1) Variáveis de ambiente
O app agora lê:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

Arquivo:
- `.env.local` (já preenchido neste ZIP)
- `.env.example` (modelo)

> Não commitar `.env.local` (já está ignorado via `*.local` no `.gitignore`).

## 2) Criar tabelas + RLS + Storage bucket
No painel do Supabase:
1. Vá em **SQL Editor**
2. Cole e rode o conteúdo de `supabase_setup.sql`

Isso cria as tabelas esperadas pelo app e também o bucket `media`.

### Sobre “pastas”
No Supabase Storage, **pastas não são criadas manualmente**.
Você verá “pastas” quando enviar arquivos com paths tipo:
- `anomalies/<id>/<arquivo>.jpg`
- `notices/<id>/<arquivo>.pdf`

## 3) Teste rápido
Depois de rodar o SQL:
- Abra o app
- Crie um registro
- Confira no Supabase (Table Editor) se está gravando.

## 4) Segurança (importante)
As políticas deste setup deixam leitura/escrita abertas para role `anon`.
Isso é OK apenas para app interno. Se quiser, depois restringimos por PIN, token, ou autenticação.
