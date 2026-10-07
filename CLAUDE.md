# CLAUDE.md — Semeia Leads

Leia este arquivo inteiro antes de mexer no código. Consulte `docs/` conforme a tarefa.

## O que é
**Semeia Leads** é um **SaaS** (Grupo Semeia Digital) de captação de leads, gestão de carteira/venda e pós-venda para **distribuidoras B2B que usam o ERP Ctrl-e (Rein Sistemas)**. É uma camada comercial sobre o ERP: o ERP é a fonte da verdade de clientes, produtos, preços e pedidos; o app lê pela **API Rein**, guarda um espelho local e adiciona carteira por vendedor, priorização, agenda de contatos, funil de leads, pós-venda e indicadores.

- **Primeiro cliente (tenant piloto):** AC3 Informática (Augusto Rodrigues; matriz Curitiba/PR, filial Itajaí/SC; ~1.000 revendedores; 4 vendedores; vendas pelo WhatsApp).
- Idioma da UI, mensagens, erros e commits: **português do Brasil**, tom simples. Identificadores no código em **inglês** (termos do ERP — `pessoa`, `pedido` — ficam como são nos tipos da Rein). Rodapé/telas públicas: "Um produto Grupo Semeia Digital".
- Uso real: celular dos vendedores (PWA) e WhatsApp. Toda tela funciona em 360–400 px.

## Documentos
| Arquivo | Quando ler |
|---|---|
| `docs/01-produto-mvp.md` | Escopo, personas, histórias, telas, critérios de aceite |
| `docs/02-api-rein.md` | Qualquer código que chame a API Rein (HMAC, endpoints, lacunas ⚠️ VALIDAR) |
| `docs/03-arquitetura.md` | Sync, regras de negócio (ABC, status, score, agenda). **Stack/Prisma/pg-boss desatualizados** — vale esta página |
| `docs/04-roadmap.md` | Ordem de implementação; marque `[x]` ao concluir |

## Stack (Cloudflare — mesma do AroCerto)
- **Um Worker** (`wrangler.jsonc`): API Hono em `/api/*` + SPA React (Vite, `dist/`) com fallback SPA. `run_worker_first: ["/api/*"]`.
- **D1** `semeia-leads` (binding `DB`, id `41fa0c8d-488a-47ff-a20f-05bbb66ef05f`). Migrações em `migrations/` (`npm run db:local` / `db:remote`). Nunca editar migração já aplicada — criar `0002_...sql`.
- Jobs do sync: **Cron Triggers** (+ Queues se precisar de fan-out). Sem Redis, sem Postgres.
- Imagens de produto (Sprint 2): **R2**. Ainda não criado.
- Validação com zod (a adicionar junto com os métodos tipados do cliente Rein), testes com **vitest**.
- Não mexer em outros Workers/bancos da conta Cloudflare (`semeia-api`, `semeia-classificados`, `arocerto`).

## Regras inegociáveis
1. **Multi-tenant — regra nº 1.** Toda tabela de negócio tem `tenant_id`. **Toda query filtra por `tenantOf(c)`** (vem da sessão, nunca do corpo). UPDATE/DELETE sempre com `WHERE id=? AND tenant_id=?`. IDs vindos do cliente (conta, produto, vendedor) devem ser conferidos como da empresa. Vendedor só vê `owner_id = eu`.
2. **Credenciais Rein só no backend.** `client_secret` fica criptografado (AES-GCM, `SECRETS_KEY` do Worker) em `tenant_rein`, nunca volta ao navegador nem entra em log/auditoria.
3. **Toda chamada à Rein passa por `worker/rein/client.ts`.** Nada de `fetch` solto para a Rein.
4. **Escrita no ERP protegida por flag por empresa** (`tenant_rein.pessoa_write_enabled`, `pedido_write_enabled`; padrão desligado). Pedido tem efeito fiscal — só ligar após homologar. Com a flag desligada, grava local como pendente e avisa o vendedor.
5. **O app não é fonte da verdade do ERP.** Tabelas espelho só são alteradas pelo sync; dados próprios (carteira, leads, tarefas, interações, NPS) em tabelas próprias.
6. Itens ⚠️ VALIDAR de `docs/02-api-rein.md` são hipóteses: implemente atrás de config e escreva teste de contrato.
7. LGPD: não exportar contatos em massa sem papel `manager`/`admin`; auditar exportações (`audit_log`). Custo e margem nunca chegam ao vendedor. Não colocar dados pessoais em URL.

## Autenticação e papéis
PBKDF2-SHA256 100k; cookie `semeialeads_sessao` (HttpOnly, Secure em HTTPS, SameSite=Lax, 30 dias); `sessions` guarda o SHA-256 do token. Papéis por empresa em `members`: `admin` (dono da conta), `manager` (gestor), `seller` (vendedor). Usuário pode estar em várias empresas (`/api/auth/switch-tenant`). Convites: `/convite/<token>` (7 dias, banco guarda hash). Administradores da plataforma: e-mails em `ADMINS` (`wrangler.jsonc`); ainda sem tela.
Cadastro novo = **teste grátis de 14 dias** (`plan='trial'`). **Preços/planos do SaaS ainda não definidos** — não inventar; perguntar ao Neto.

## Convenções
Dinheiro em centavos (inteiro) ou decimal — nunca float. Datas no banco em UTC; exibir em `America/Sao_Paulo`. Erros: `throw fail(status, 'mensagem em português')` → `{ erro }`. Regra de negócio nova vai em módulo puro (`worker/domain/`, sem I/O) com teste antes de usar na API. Commits pequenos, em português e no imperativo.

## Comandos
```bash
npm install
npm run db:local && npm run dev   # build do front + wrangler dev (precisa de .dev.vars com SECRETS_KEY)
npm run dev:web                   # Vite com proxy para o Worker (porta 8787)
npm run typecheck && npm test && npm run build   # precisam passar antes de commit
npm run db:remote                 # migrações no D1 de produção
npx wrangler secret put SECRETS_KEY   # openssl rand -base64 32
```

## Onde paramos
**Sprint 0 concluída** (fundação): cadastro/login/convite, equipe, tela de conexão com o ERP (segredo criptografado, modo teste), cliente Rein com HMAC testado, migração 0001. Próximo: **Sprint 1/2** (métodos tipados da Rein, modo mock com fixtures, sync). Antes do sync real, confirmar com a Rein as perguntas de `docs/02-api-rein.md` §6.
Pendências de infraestrutura: secret `SECRETS_KEY` e deploy na Cloudflare, domínio, CI, PWA (manifest/service worker), landing page.
