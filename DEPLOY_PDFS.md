# Instruções de Deploy dos PDFs

## Para Desenvolvimento (npm run dev)

Os PDFs devem estar na pasta raiz `PDFs/` e serão servidos automaticamente pelo Vite.

## Para Build/Deploy (npm run build)

Para que os PDFs sejam inclusos no build final:

### Opção 1: Copiar para a pasta `public` (Recomendado)

1. Crie uma pasta `public/PDFs/` se não existir
2. Copie todos os arquivos da pasta `PDFs/` para `public/PDFs/`
3. Execute o build normalmente:
   ```bash
   npm run build
   ```

### Opção 2: Usando script de build customizado

Você pode adicionar um script no `package.json`:

```json
{
  "scripts": {
    "prebuild": "cp -r PDFs public/",
    "build": "tsc && vite build"
  }
}
```

Então execute:
```bash
npm run build
```

## Para Android (Capacitor)

1. Certifique-se que os PDFs estão na pasta `public/PDFs/`
2. Execute o build:
   ```bash
   npm run build
   ```
3. Copie os arquivos para o Android:
   ```bash
   npx cap sync android
   ```
4. Os PDFs estarão em `android/app/src/main/assets/public/PDFs/`

## Verificação

Após o build, verifique se:
- [ ] Pasta `dist/PDFs/` existe
- [ ] Arquivos PDF estão em `dist/PDFs/`
- [ ] Ao executar `npm run preview`, os PDFs podem ser acessados em `http://localhost:4173/PDFs/...`

## Troubleshooting

Se os PDFs não aparecerem:

1. Verifique se a pasta `public/PDFs/` existe
2. Verifique se os arquivos estão em `public/PDFs/`
3. Limpe o cache: `rm -rf dist node_modules/.vite`
4. Reconstrua: `npm run build`
5. Verifique o console do navegador para erros 404

## Estrutura Final

```
seu-projeto/
├── dist/
│   ├── PDFs/
│   │   ├── INTRUÇÕES DE TRABALHO/
│   │   ├── NORMAS E ORGANIZAÇÃO/
│   │   └── MELHORIAS/
│   └── ... outros arquivos
├── public/
│   └── PDFs/
│       ├── INTRUÇÕES DE TRABALHO/
│       ├── NORMAS E ORGANIZAÇÃO/
│       └── MELHORIAS/
└── PDFs/ (origem)
    ├── INTRUÇÕES DE TRABALHO/
    ├── NORMAS E ORGANIZAÇÃO/
    └── MELHORIAS/
```
