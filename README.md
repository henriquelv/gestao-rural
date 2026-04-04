<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Capacitor-5-119EFF?logo=capacitor&logoColor=white" />
  <img src="https://img.shields.io/badge/Supabase-Pro-3FCF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white" />
</p>

# Gestao Rural

**Sistema de gestao operacional para fazendas leiteiras** — aplicativo Android desenvolvido para uso diario no campo, com funcionamento completo offline.

Registra dados de producao, anomalias, instrucoes de trabalho, comunicados e normas. Sincroniza automaticamente com a nuvem quando ha conexao, garantindo que todos os dispositivos da fazenda tenham os mesmos dados atualizados.

---

## Funcionalidades

### Producao e Dados
- Registro diario de **volume de leite**, **vacas em lactacao**, **descartes** e **nascimentos**
- Graficos de barras (diario) e linhas (acumulado) com filtro por mes/ano
- Exportacao de dados em **CSV** compativel com Excel
- Historico completo com edicao e exclusao protegidas por PIN

### Anomalias e Melhorias
- Registro de anomalias por setor com fotos e videos
- Acompanhamento de resolucao (quem resolveu, quando)
- Registro de sugestoes de melhoria dos funcionarios

### Instrucoes de Trabalho e Normas
- Organizacao por setor (Ordenha, Manejo, Alimentacao, etc.)
- Suporte a fotos, videos, PDFs e documentos
- Protecao por PIN para adicao e edicao
- Visualizacao de documentos com zoom

### Comunicados
- Publicacao de comunicados para toda a equipe
- Suporte a midia (fotos, videos, documentos)

### Offline-First
- **Funciona 100% sem internet** — dados e midias ficam no dispositivo
- Sincronizacao automatica quando ha conexao (a cada 1 minuto)
- Cache offline de imagens e videos de todos os dispositivos
- Indicador visual de status da conexao
- Deteccao e alerta de conflitos entre dispositivos
- Recuperacao automatica de dados orfaos

---

## Arquitetura

```
┌─────────────────────────────────┐
│         App React/TS            │
│    (Capacitor → Android APK)    │
└──────────────┬──────────────────┘
               │
    ┌──────────┴──────────┐
    │    db.service.ts     │   smartRead / smartWrite
    │    (CRUD + Sync)     │   outbox pattern
    └──────────┬──────────┘
               │
    ┌──────────┴──────────┐
    │    localdb.ts        │   Abstrai plataforma
    └───┬─────────────┬───┘
        │             │
   ┌────┴────┐  ┌─────┴─────┐
   │ SQLite  │  │  Dexie    │   Banco local
   │(Android)│  │(IndexedDB)│
   └─────────┘  └───────────┘
               │
    ┌──────────┴──────────┐
    │     Supabase         │   PostgreSQL + Storage
    │   (Plano Pro)        │   Sync + Midia
    └──────────────────────┘
```

**Fluxo de sincronizacao:**

1. Escrita local → banco + outbox (synced=false)
2. Sync envia outbox → Supabase → marca synced=true
3. Refresh puxa delta do servidor → atualiza banco local
4. Ghost cleanup remove registros deletados no servidor
5. Pre-cache baixa midias remotas para uso offline

---

## Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| **UI** | React 18 + TypeScript + Tailwind CSS |
| **Build** | Vite 5 |
| **Mobile** | Capacitor 5 (Android) |
| **Banco local (web)** | Dexie.js (IndexedDB) |
| **Banco local (nativo)** | SQLite (`@capacitor-community/sqlite`) |
| **Backend** | Supabase Pro (PostgreSQL + Storage + Auth) |
| **Roteamento** | React Router 6 (HashRouter) |

---

## Configuracao

### Pre-requisitos

- Node.js 18+
- Android Studio (para gerar APK)
- Conta Supabase com projeto configurado

### Instalacao

```bash
# Instalar dependencias
npm install

# Configurar variaveis de ambiente
cp .env.example .env.local
# Editar .env.local com as chaves do Supabase

# Configurar banco Supabase
# Executar supabase_setup.sql no SQL Editor do Supabase
```

### Desenvolvimento

```bash
npm run dev          # Servidor local (http://localhost:5173)
```

### Build e Deploy (Android)

```bash
npm run build        # Compila TypeScript + bundle Vite
npx cap sync         # Copia build para pasta Android
# Android Studio → Build → Generate Signed APK
```

---

## Estrutura do Projeto

```
├── App.tsx                    # Rotas + ciclo de sync
├── components/                # Componentes reutilizaveis
│   ├── Layout.tsx             #   Layout principal + indicadores
│   ├── Header.tsx             #   Cabecalho com navegacao
│   ├── PinGuard.tsx           #   Protecao por PIN
│   └── PinRequestModal.tsx    #   Modal de autenticacao
├── screens/                   # Telas do app
│   ├── farmdata/              #   Dados da fazenda (leite, nascimentos...)
│   ├── instructions/          #   Instrucoes de trabalho + normas
│   ├── notices/               #   Comunicados
│   ├── improvements/          #   Melhorias
│   └── ...
├── services/                  # Logica de negocio
│   ├── db.service.ts          #   CRUD principal + sync + cache
│   ├── sync.service.ts        #   Processamento do outbox
│   ├── localdb.ts             #   Abstracao web/nativo
│   ├── localdb.web.ts         #   Schema Dexie (IndexedDB)
│   ├── localdb.native.ts      #   SQLite (Android)
│   ├── media.service.ts       #   Compressao + upload + cache offline
│   └── supabase.ts            #   Cliente Supabase
├── constants/                 # Setores, cores
├── types.ts                   # Tipos TypeScript
├── supabase_setup.sql         # Schema do banco + Storage + RLS
└── android/                   # Projeto Android (Capacitor)
```

---

## Licenca

Projeto privado. Todos os direitos reservados.
