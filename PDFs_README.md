# Integração de PDFs no App

## Estrutura de Pastas

Os PDFs estão organizados da seguinte forma:

```
PDFs/
├── INTRUÇÕES DE TRABALHO/
│   ├── ORDENHA/
│   ├── MANEJO/
│   ├── ALIMENTAÇÃO/
│   ├── CONFORTO/
│   ├── SERVIÇOS EXTERNOS/
│   ├── MATERNIDADE/
│   └── CRIAÇÃO/
├── NORMAS E ORGANIZAÇÃO/
│   ├── NORMAS DA FAZENDA/
│   ├── ORGONOGRAMA/
│   ├── CARGOS E SALARIOS/
│   └── RESP POR FUNÇÃO/
└── MELHORIAS/
```

## Como Funciona

### Acessar PDFs no App

1. **Botão Flutuante**: Um botão âmbar com ícone de livro aparece em todas as telas (exceto na página de PDFs)
2. **Menu Principal**: Clique no botão para acessar a página de PDFs
3. **Abas de Seção**: Escolha entre "Instruções", "Normas" ou "Melhorias"

> **Conversão para imagens**
>
> O app agora trata arquivos de mídia (fotos/vídeos) diferente de documentos. Se quiser que uma
> instrução ou norma apareça como imagem em vez de PDF, converta o(s) PDF(s) em imagens e
> atualize o registro no banco (a tela de visualização suportará `photo` / `video`).
>
> Para facilitar essa transformação localmente existe um utilitário:
>
> ```bash
> # garanta que o ImageMagick esteja instalado (comando `magick` disponível)
> cd gestao-rural-final
> npm run convert-pdfs
> ```
>
> Ele percorrerá a pasta `PDFs` e para cada `*.pdf` criará um subdiretório com as páginas em
> PNG (nome_do_pdf_images/nome_do_pdf-001.png, etc.).
>
> Depois você pode mover as imagens para `upload` ou gravar o registro correspondente no banco.

4. **Categorias**: Selecione uma categoria específica (setor ou submenu)
5. **Arquivos**: Clique no PDF para visualizá-lo

### Adicionar Novos PDFs

1. Adicione os arquivos PDF nas pastas correspondentes
2. Registre o nome do arquivo em `services/pdf.service.ts` no objeto `PDF_FILES_MAP`
3. Exemplo:

```typescript
export const PDF_FILES_MAP: Record<string, string[]> = {
  'ORDENHA': ['Rotina de Ordenha.pdf', 'Novo PDF.pdf'], // ← Adicione aqui
  // ...
};
```

## Arquivos Envolvidos

- **[services/pdf.service.ts](../../services/pdf.service.ts)**: Configuração de categorias e mapeamento de arquivos
- **[screens/PDFViewerScreen.tsx](../../screens/PDFViewerScreen.tsx)**: Interface para visualizar PDFs
- **[components/Layout.tsx](../../components/Layout.tsx)**: Botão flutuante de acesso rápido
- **[App.tsx](../../App.tsx)**: Rotas de navegação para PDFs

## Funcionalidades

✅ **Offline**: Todos os PDFs funcionam offline
✅ **Organizado**: Estrutura clara por setor e submenu
✅ **Fácil Acesso**: Botão flutuante em todas as telas
✅ **Mobile**: Otimizado para telas de celular
✅ **Expandível**: Fácil adicionar novos PDFs

## Rotas Disponíveis

- `/pdfs` - Menu principal de PDFs
- `/pdfs/instructions` - Instruções de trabalho
- `/pdfs/norms` - Normas e organização
- `/pdfs/improvements` - Melhorias

## Notas Téceis

- Os PDFs são acessados via URL relativa `/PDFs/...`
- Espaços em nomes de arquivo são substituídos por `%20` nas URLs
- O aplicativo abre PDFs em uma nova aba do navegador
- Para Android/Capacitor, a pasta PDFs deve estar em `www/PDFs/`
