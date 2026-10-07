# Arquitetura — Carteira AC3

## 1. Visão geral

```
 [PWA Next.js]  ──HTTPS/JSON──▶  [apps/api Fastify]  ──▶  [PostgreSQL]
  vendedor/gestor                    │    ▲                (espelho ERP + dados do app + fila pg-boss)
                                     │    │
                                     ▼    │ jobs pg-boss (sync, regras, tarefas)
                              [packages/rein-client] ──HMAC──▶ api.rein.net.br (ERP Ctrl-e)
                                     │
                              BrasilAPI (CNPJ)
```

## 2. Estrutura do monorepo

```
carteira-ac3/
├─ CLAUDE.md
├─ docs/
├─ apps/
│  ├─ api/            # Fastify: rotas, auth, jobs, prisma
│  │  ├─ prisma/schema.prisma
│  │  └─ src/{routes,jobs,services,plugins}/
│  └─ web/            # Next.js App Router (PWA)
│     └─ src/app/{(vendedor),(gestor),(public)}/
├─ packages/
│  ├─ rein-client/    # auth HMAC, tipos zod, paginação, retry, mock/fixtures
│  └─ domain/         # regras puras: abc, status, score, agenda, recompra
└─ .env.example
```

## 3. Sincronização com o ERP (jobs pg-boss)

| Job | Frequência | O que faz |
|---|---|---|
| `sync.backfill` | manual (1x) | usuários, tabelas, categorias, marcas, produtos, pessoas, pedidos de venda dos últimos 24 meses em janelas mensais |
| `sync.pedidos` | a cada 15 min | `GET /pedido?TipoMovimento=4` com janela móvel **hoje − 3 dias → hoje** (pega edições); upsert por id; para pedidos novos, busca detalhe se necessário |
| `sync.cadastros` | diário 02:00 | pessoas, produtos (+grade/margem), tabelas, categorias, marcas, usuários — paginação completa; upsert comparando `DataUltimaModificacao` |
| `metrics.recompute` | após `sync.pedidos` com novidade + diário 03:00 | recalcula métricas por cliente (RFM, ABC, status, intervalo médio) |
| `tasks.generate` | após `metrics.recompute` | cria tarefas de pós-venda/reativação/recompra (idempotente por chave) |
| `leads.convert` | após `sync.pedidos` | casa CNPJ de pedidos novos com leads abertos |

Regras do sync:
- Upsert idempotente pela chave do ERP (`reinId`). Guardar o JSON bruto em `raw Json` para auditoria/campos futuros.
- `SyncRun` registra início, fim, contagens, erros; painel admin exibe.
- Cliente Rein: concorrência máx. 2, timeout 30 s, retry exponencial (3x) em 429/5xx/timeout, renovar assinatura a cada request.
- Nunca apagar espelho: registros sumidos ficam com `deletedAt` só após 2 syncs completos sem aparecer.

## 4. Modelo de dados (Prisma — esboço)

```prisma
enum Role { ADMIN GESTOR VENDEDOR }
enum Curve { A B C }
enum AccountStatus { PROSPECT ATIVO EM_RISCO INATIVO }
enum LeadStage { NOVO CONTATADO CATALOGO_ENVIADO NEGOCIANDO CONVERTIDO PERDIDO }
enum TaskType { CONTATO_CARTEIRA POS_VENDA_D1 NPS_D7 TRATAR_NPS RECOMPRA REATIVACAO LEAD_FOLLOWUP }
enum TaskStatus { ABERTA FEITA CANCELADA }
enum InteractionResult { VENDEU ORCAMENTO SEM_INTERESSE NAO_RESPONDEU REAGENDAR }

model Tenant { id String @id @default(cuid()) name String createdAt DateTime @default(now()) }

model User {
  id String @id @default(cuid())
  tenantId String
  name String
  email String @unique
  passwordHash String
  role Role
  reinUsuarioId Int?        // vínculo com usuario/CodVendedor do ERP
  whatsapp String?
  active Boolean @default(true)
}

// ---------- Espelho do ERP (só o sync escreve) ----------
model ReinPessoa {
  reinId Int @id
  tenantId String
  nome String
  razaoSocial String?
  cnpj String? @db.VarChar(14)    // só dígitos, indexado
  cnae String?
  whatsapp String?  celular String?  fone String?  emailMalaDireta String?
  cidade String?  uf String?
  tabelaPrecoPadrao Int?
  limiteCredito Decimal?
  canalVendaId Int?
  tipoCliente Json?
  dataCadastro DateTime?
  dataUltimaModificacao DateTime?
  raw Json
  syncedAt DateTime
  @@index([cnpj])
}
model ReinUsuario { reinId Int @id  tenantId String  nome String  raw Json }
model ReinProduto {
  reinId Int @id
  tenantId String
  nome String  codigo String?  sku String?  marcaId Int?  categoriaIds Int[]
  ativo Boolean  imageUrl String?   // imagem extraída e salva em storage/CDN, não base64 no banco
  dataUltimaModificacao DateTime?
  raw Json
}
model ReinPreco { produtoReinId Int  tabelaPrecoId Int  preco Decimal  custo Decimal?  margem Decimal?  @@id([produtoReinId, tabelaPrecoId]) }
model ReinTabelaPreco { reinId Int @id  nome String }
model ReinCategoria { reinId Int @id  nome String  paiId Int? }
model ReinMarca { reinId Int @id  nome String }
model ReinPedido {
  reinId Int @id
  tenantId String
  pessoaReinId Int        // CodDestino
  vendedorReinId Int?     // CodVendedor
  canalVendaId Int?
  dataMov DateTime
  valorTotal Decimal
  finalizado Boolean?
  cancelado Boolean @default(false)
  raw Json
  itens ReinPedidoItem[]
  @@index([pessoaReinId, dataMov])
}
model ReinPedidoItem { id String @id @default(cuid())  pedidoReinId Int  produtoReinId Int  qtd Decimal  valorUnitario Decimal  pedido ReinPedido @relation(fields:[pedidoReinId], references:[reinId]) }

// ---------- Dados do app ----------
model Account {               // cliente na visão comercial (1:1 com ReinPessoa)
  id String @id @default(cuid())
  tenantId String
  pessoaReinId Int @unique
  ownerId String?             // vendedor dono da carteira
  curve Curve?
  status AccountStatus
  revenue12m Decimal @default(0)
  orders12m Int @default(0)
  avgTicket Decimal?
  avgIntervalDays Int?
  lastOrderAt DateTime?
  lastContactAt DateTime?
  nextContactDue DateTime?
  priorityScore Int @default(0)
  updatedAt DateTime @updatedAt
}
model OwnershipHistory { id String @id @default(cuid())  accountId String  fromUserId String?  toUserId String  byUserId String  at DateTime @default(now()) }
model Interaction {
  id String @id @default(cuid())
  accountId String?  leadId String?  userId String
  channel String            // whatsapp | ligacao | visita | email
  result InteractionResult?
  note String?
  nextContactAt DateTime?
  createdAt DateTime @default(now())
}
model Task {
  id String @id @default(cuid())
  tenantId String
  type TaskType  status TaskStatus @default(ABERTA)
  accountId String?  leadId String?  assigneeId String
  dueAt DateTime  reason String
  dedupeKey String @unique  // ex.: "NPS_D7:pedido:12345"
  doneAt DateTime?
}
model Lead {
  id String @id @default(cuid())
  tenantId String
  cnpj String  razaoSocial String?  contactName String?  whatsapp String?
  cidade String?  uf String?  segment String?  source String   // site | manual | lista | indicacao
  stage LeadStage @default(NOVO)
  lostReason String?
  ownerId String?
  pessoaReinId Int?         // preenchido ao cadastrar no ERP ou converter
  enrichment Json?          // BrasilAPI
  createdAt DateTime @default(now())
  @@index([cnpj])
}
model PrePedido { id String @id @default(cuid())  accountId String  userId String  items Json  total Decimal  status String /* RASCUNHO|ENVIADO|ERRO|PENDENTE_FLAG */  pedidoReinId Int?  error String?  createdAt DateTime @default(now()) }
model NpsResponse { id String @id @default(cuid())  token String @unique  accountId String  pedidoReinId Int  score Int?  comment String?  answeredAt DateTime? }
model MessageTemplate { id String @id @default(cuid())  tenantId String  key String  title String  body String /* placeholders {{contato}} {{empresa}} {{vendedor}} {{produto}} */ }
model Setting { tenantId String  key String  value Json  @@id([tenantId, key]) }
model SyncRun { id String @id @default(cuid())  job String  startedAt DateTime  finishedAt DateTime?  ok Boolean?  stats Json?  error String? }
```

## 5. Regras de negócio (`packages/domain`) — parâmetros default em `Setting`

**Faturamento considerado**: pedidos de venda (`TipoMovimento=4`) não cancelados dos últimos 12 meses.

**Status** (por dias desde o último pedido):
- `PROSPECT`: nenhum pedido
- `ATIVO`: ≤ 90 dias
- `EM_RISCO`: 91–180 dias
- `INATIVO`: > 180 dias

**Curva ABC** (só clientes com faturamento 12m > 0, ordenados por faturamento desc., por tenant):
top 20% dos clientes = `A`, próximos 30% = `B`, restantes = `C`.

**Frequência de contato**: A = 7 dias · B = 14 dias · C = 30 dias · EM_RISCO = 15 dias · INATIVO = 45 dias.
`nextContactDue = lastContactAt + frequência` (ou agora, se nunca contatado), sobrescrito por "Reagendar".

**Score de prioridade (0–100)** para ordenar a agenda:
```
score = pesoCurva (A 40, B 25, C 10)
      + atrasoContato   = min(25, diasAtrasoDoNextContactDue * 2)
      + recompra        = 20 se dias desde último pedido >= 0.9 * avgIntervalDays (≥3 pedidos)
      + risco           = 15 se EM_RISCO, 8 se INATIVO
```

**Agenda do dia** (por vendedor): tarefas abertas com `dueAt ≤ hoje` + accounts com `nextContactDue ≤ hoje`,
deduplicado por cliente, ordenado por score desc., limite `agendaSize` (default 25).

**Contato registrado** → `lastContactAt = agora`; recalcula `nextContactDue`; fecha tarefas abertas do cliente
que o contato resolve (CONTATO_CARTEIRA, RECOMPRA, REATIVACAO, POS_VENDA_D1).

**Seed da carteira**: `ownerId` = usuário do app vinculado ao `vendedorReinId` do pedido mais recente;
clientes sem pedido ou sem vínculo vão para "Sem dono" (gestor distribui). Mudanças posteriores só pelo gestor.

**Positivação do mês** = clientes da carteira com ≥ 1 pedido no mês ÷ clientes da carteira (ATIVO+EM_RISCO+INATIVO).

**Rodízio de leads**: próximo vendedor ativo em ordem circular (ponteiro em `Setting`).

## 6. API do app (REST, prefixo `/v1`)

```
POST /auth/login · POST /auth/logout · GET /me
GET  /agenda                       # vendedor logado
GET  /accounts?curve&status&q&page # escopo pelo papel
GET  /accounts/:id                 # ficha + métricas + pedidos + interações + gaps de categoria
POST /accounts/:id/interactions
POST /accounts/reassign            # gestor
GET  /products?q&categoria&marca&accountId   # preço da tabela do account
POST /pre-pedidos · POST /pre-pedidos/:id/send
GET/POST/PATCH /leads · POST /leads/:id/push-erp
POST /public/leads                 # formulário público (rate limit + captcha simples)
GET/POST /public/nps/:token
GET  /dashboard?month              # gestor
GET  /admin/sync-runs · POST /admin/sync/:job
GET/PUT /settings · GET/PUT /templates
```

## 7. Segurança

- Escopo por papel aplicado no service (não só na rota): vendedor filtra sempre por `ownerId = me`.
- Rate limit nas rotas públicas; tokens NPS aleatórios (≥ 128 bits).
- Logs sem segredos e sem payload completo de pessoa.
- Backups diários do Postgres.

> **Nota (SaaS no Cloudflare):** os trechos de stack acima (Fastify, Prisma, Postgres, pg-boss) vieram do plano original. A implementação usa Worker + Hono + D1 (SQLite) + Cron Triggers/Queues; o modelo de dados real está em `migrations/`. As regras de negócio (seção 5) continuam valendo.

## 8. Deploy sugerido

Um VPS ou PaaS (Railway/Render/Fly) com Postgres gerenciado; `api` e `web` como serviços separados;
domínio `carteira.ac3informatica.com.br`. CI: lint + test em PR.
