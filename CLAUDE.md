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
Cadastro novo = **teste grátis de 14 dias** com tudo liberado (`plan='trial'`); depois vale o plano contratado (`tenants.tier`). **Planos (aprovados pelo Neto, `worker/plans.ts`):**

| Plano | Preço/mês | Vendedores | Clientes | Conteúdo |
|---|---|---|---|---|
| Essencial (nível 1) | R$ 249,90 | 2 | 500 | Carteira, agenda do dia, ficha do cliente, WhatsApp em 1 toque |
| Profissional (nível 2) | R$ 449,90 | 5 | 2.000 | + catálogo com preço da tabela, pré-pedido, funil de leads, pós-venda e NPS |
| Distribuidor (nível 3) | R$ 799,90 | 15 | sem limite | + painel do gestor, redistribuição de carteira, várias filiais, suporte prioritário |

Vendedor adicional R$ 59,90/mês; anual = 10 × mensal (2 meses grátis); sem taxa de implantação; **sem desconto de fundador** (decisão do Neto). "Vendedor" = membro com papel `seller`. Limite de vendedores é imposto no servidor (`assertVagaVendedor`); limite de clientes é só aviso — **dados nunca são apagados**. Gating de funções por plano: `requireNivel(n)` (`worker/lib.ts`) quando as funções existirem. Cobrança ainda não implementada (reaproveitar o padrão Asaas do AroCerto). Plataforma: `PATCH /api/admin/tenants/:id` (só `ADMINS`) muda tier/situação/vendedores extras.

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

## Carteira (`worker/domain/carteira.ts`, `worker/metrics.ts`, `worker/routes/accounts.ts`)
- Regras puras e testadas: status (≤90 ativo, ≤180 em risco, senão inativo, sem pedido = prospect), curva ABC (20% A / 30% B / resto C entre quem faturou nos últimos 12 meses), frequência de contato (A7 B14 C30; em risco/inativo usam o menor entre a curva e 15/45 dias), score 0–100 (curva + atraso + recompra prevista + risco), agenda do dia, positivação. Parâmetros padrão em `PARAMS_PADRAO`, sobrescritos por `settings.params`.
- `accounts` guarda dono (`owner_id`) e métricas por cliente do ERP. `recomputeAccounts` recalcula tudo e **nunca troca dono já definido**; só sem dono recebe o vendedor do último pedido (ligação pessoa↔vendedor do ERP em Configurações → Equipe). `ownership_history` registra trocas.
- Vendedor só enxerga `owner_id = ele` (lista e ficha, 404 fora disso); gestor/admin veem tudo e movem clientes. Ficha nunca traz custo/margem.

## Agenda, contato e pós-venda (`worker/domain/contato.ts`, `routes/agenda.ts`, `tasks.ts`)
- `GET /api/agenda` junta contas com contato vencido + tarefas vencidas (`agendaCompleta`, pura): um item por cliente, tarefa manda no motivo e eleva o score (Tratar insatisfação 100, pós-venda 60, NPS 50). Responsável = dono ATUAL da conta; cliente sem dono só aparece para gestor (`?escopo=todos`). A resposta já traz a mensagem de WhatsApp renderizada.
- Registrar contato (`POST /api/accounts/:id/interactions`): resultado obrigatório; define `reschedule_at` (orçamento +3 d, não respondeu +2 d, sem interesse +30 d, reagendar = data, vendeu = frequência normal); "não respondeu" mantém a tarefa aberta e adia 2 dias, os demais concluem. Clique no WhatsApp só entra no histórico, não conta como contato.
- Tarefas `POS_VENDA_D1`/`NPS_D7` nascem no fim de cada sync para pedidos dos últimos 10 dias (idempotente por `dedupe_key`; a carga de 24 meses não inunda a agenda). NPS: `/nps/:token` (público, 192 bits, uma resposta); nota ≤ 6 cria `TRATAR_NPS`. Recompra/reativação são motivos da agenda, não tarefas.
- Modelos de mensagem por empresa (`message_templates`, variáveis `{{contato}} {{vendedor}} {{empresa}} {{produto}} {{link}}`), criados na primeira leitura e editáveis em Configurações.

## Catálogo e pré-pedido (`routes/catalogo.ts`, `routes/prepedidos.ts`, `domain/pedido.ts`)
- Plano Profissional (nível 2) ou acima (`requireNivel(2)` em `/catalogo` e `/pre-pedidos`); conta suspensa é barrada em tudo que usa `requireNivel`.
- Catálogo mostra o preço da **tabela do cliente** (`rein_pessoas.price_table_id` → `rein_precos`); sem cliente escolhido não há preço. Vendedor só consulta cliente da própria carteira. Nunca sai custo/margem.
- **O preço nunca vem do navegador**: o servidor refaz o preço de cada linha na tabela do cliente ao criar/editar (`precificar`) e grava no pedido (`pre_order_items`). Quantidade é inteira de 1 a 99.999, sem produto repetido, até 200 linhas. Vendedor só enxerga os pré-pedidos que montou; gestor vê todos.
- Envio ao ERP (`POST /api/pre-pedidos/:id/enviar`): com `pedido_write_enabled` desligado vira `PENDENTE_FLAG` (resumo para copiar). Ligado: exige a configuração do pedido (`settings.pedido_erp`: CodOrigem, canal "App Carteira", natureza, uso, presença, meio de pagamento, prazo) e o vendedor ligado ao ERP; reserva `ENVIANDO` antes de chamar a Rein e **nunca repete** (`reinFetch` só repete GET). Em erro vira `ERRO` com aviso de conferir no ERP antes de reenviar; o gestor resolve com `/resolver`. Modo de teste "envia" com id fictício.
- ⚠️ Todos os valores do corpo do `PUT /pedido` são hipóteses até a Rein confirmar (pergunta 9 de `docs/02-api-rein.md`).

## Leads (`worker/domain/leads.ts`, `worker/leads.ts`, `routes/leads.ts`, `routes/publico.ts`)
- Plano Profissional (nível 2) ou acima (`requireNivel(2)` em `/leads`; o formulário público some para quem não tem o plano ou está suspenso, com a mesma resposta de "não existe").
- Criação (`criarLead`) valida CNPJ (dígitos verificadores), WhatsApp e contato; consulta a BrasilAPI (só 14 dígitos válidos, timeout 4 s, falha nunca bloqueia); dono = quem cadastrou (vendedor), escolhido pelo gestor ou **rodízio circular** entre vendedores ativos (ponteiro em `settings.lead_rodizio`). Índice único parcial garante **um lead aberto por CNPJ por empresa**, mesmo com envios simultâneos.
- **Privacidade do formulário público:** a resposta é sempre `{ok:true}`, seja lead novo, repetido ou CNPJ que já é cliente. Nunca revelar a carteira da empresa a quem preenche. Cadastro manual, ao contrário, avisa (409) "já é cliente de X" / "já existe lead aberto com Y". Lead de CNPJ que já era cliente nasce com `existing_client=1`, vai para o dono da conta e **não converte sozinho**.
- Funil: `validarTransicao` (convertido só pelo sistema e não sai; perdido exige motivo e só reabre como Novo). Follow-up: Novo vence na hora, depois +2/+3 dias; aparece em "Leads para acompanhar" na tela Hoje. Vendedor só vê/mexe nos leads dele; só o gestor troca o dono.
- Conversão (`convertLeads`, no fim de cada sync): liga o lead ao cadastro do ERP pelo CNPJ e, no primeiro pedido não cancelado, vira `CONVERTIDO` e a conta passa para o vendedor do lead (com `ownership_history`).
- Cadastro no ERP (`POST /api/leads/:id/push-erp`): mesmo padrão de segurança do pedido (trava `pessoa_write_enabled`, config `settings.pessoa_erp`, `ENVIANDO` reservado, nunca repete, gestor resolve com `/erp-resolver`). ⚠️ Id do tipo "Prospect" e campos obrigatórios do `PUT /pessoa` são hipóteses até a Rein confirmar.

## Sync com o ERP (`worker/sync/`, `worker/rein/`)
- `ReinApi` (`worker/rein/api.ts`) é a única interface que o sync conhece; implementações real e mock (`mock.ts`, "modo de teste" por empresa). Nomes de campos da Rein ficam **só** em `normalize.ts` (⚠️ hipóteses; ajustar lá quando a Rein confirmar). Datas sem fuso da Rein são tratadas como Brasília (`ERP_UTC_OFFSET_HOURS`).
- Espelho `rein_*` (migração 0002): só o sync escreve. `rein_precos.cost/margin` são sensíveis — nunca devolver ao vendedor. `raw` não guarda imagens nem margens.
- Jobs: `backfill` (manual, 1x), `cadastros` (diário 02h Brasília), `pedidos` (janela de 3 dias, a cada 15 min). Cada chamada a `runSlice` faz no máximo 25 chamadas à Rein e salva o cursor em `sync_state`; o navegador (`POST /api/sync/:job/run`) ou o cron repetem até `done`. Trava `lease_until` evita duas fatias ao mesmo tempo.
- Pedidos: a lista pode vir sem itens → fila `items_synced=0` buscada por `/pedido/{id}` (2 em paralelo). Registro que some do ERP só ganha `deleted_at` após 2 syncs completos sem aparecer.

## Onde paramos
**Sprints 0 a 6 concluídas** com o modo de teste: fundação, cliente Rein tipado, mock, sync, carteira, planos, agenda, contato, pós-venda/NPS, catálogo, pré-pedido, funil de leads e escritas no ERP (travadas). Migrações 0001–0006 aplicadas no D1 de produção. Próximo: **Sprint 7** (painel do gestor: positivação, faturamento, ticket, status, contatos, leads por etapa, NPS; redistribuição de carteira em massa por filtro com histórico; parâmetros e modelos editáveis; deploy, backups, domínio, baseline das métricas). O **piloto com 1 vendedor** depende de deploy e de credenciais Rein reais. **Antes de ligar a Rein real:** enviar à Rein as perguntas de `docs/02-api-rein.md` §6 e ajustar `normalize.ts`/`api.ts` (paginação, datas, formato das listas) com a primeira resposta real.
Pendências de infraestrutura: secret `SECRETS_KEY` e deploy na Cloudflare, domínio, CI, PWA (manifest/service worker), landing page.
