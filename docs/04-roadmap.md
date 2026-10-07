# Roadmap MVP — 8 semanas

> Plataforma: Cloudflare (Worker + D1 + R2 + Cron/Queues), SaaS multi-tenant. Ver CLAUDE.md.

Marque `[x]` ao concluir. Cada sprint termina com algo demonstrável à AC3.

## Sprint 0 — Fundação (semana 1)
- [x] Projeto único (Worker Hono + SPA React/Vite), TS estrito, vitest (`worker/rein/`, depois `worker/domain/`)
- [x] D1 `semeia-leads` + migração 0001 (tenants, users, members, sessions, invites, tenant_rein, settings, sync_runs, audit_log); tabelas do espelho/domínio entram nas migrações das sprints 2–3
- [x] Auth (cadastro de empresa com 14 dias, login, convite da equipe, troca de empresa), papéis admin/manager/seller, shell responsivo
- [x] PWA instalável (manifest + service worker sem cache). Bottom bar do vendedor: o menu lateral já vira gaveta no celular; barra inferior fica como melhoria
- [x] `.dev.vars.example`; seção "Comandos" do CLAUDE.md atualizada
- [x] Tela de Configurações: conexão com o ERP (segredo criptografado) e equipe
- [x] CI (typecheck + test + build) no GitHub Actions
- [ ] Deploy na conta Cloudflare Grupo Semeia (secret `SECRETS_KEY`, migração remota, domínio)

## Sprint 1 — Cliente Rein (semana 2)
- [x] `worker/rein/client.ts`: assinatura HMAC (WebCrypto) + retry/timeout, com testes
- [ ] Vetor fixo contra a Rein real (validar ⚠️)
- [x] Métodos tipados (`worker/rein/api.ts` + `normalize.ts`, zod no Id): pessoas, usuarios, produtos (preço por tabela), tabelas de preço, categorias, marcas, pedidos (lista e detalhe). Falta pessoa/{id} e produto/{id} individuais (só quando houver uso)
- [x] Paginação genérica (para em página vazia ou repetida), retry/backoff, concorrência máx. 2, modo de teste (`worker/rein/mock.ts`: 60 clientes, 40 produtos, ~1.350 pedidos em 24 meses)
- [x] Botão "Testar conexão" em Configurações (chama `/api/v1/usuario`) — falta rodar com credenciais reais
- [ ] Responder/registrar as ⚠️ VALIDAR de `docs/02-api-rein.md` com o que for observado

## Sprint 2 — Sync (semana 3)
- [x] `sync_runs` + `sync_state` (cursor retomável, trava por empresa); Cron Trigger a cada 15 min no lugar do pg-boss
- [x] `backfill` (cadastros + 24 meses de pedidos + itens), `cadastros`, `pedidos` (janela móvel de 3 dias) — `worker/sync/`. Sync automático só roda para empresas com ERP real e depois da carga inicial
- [x] Extração de imagens de produto para R2 (bucket `semeia-leads-imagens`, miniatura no catálogo)
- [x] Painel "Sincronização" em Configurações (contagens, botões, progresso, último erro). Falta tela de logs detalhada e visão de plataforma
- [ ] Mapeamento `User.reinUsuarioId` (tela de usuários)

## Sprint 3 — Domínio e carteira (semana 4)
- [x] `worker/domain/carteira.ts`: status, ABC, frequência, score, agenda, recompra, positivação, parâmetros (17 testes). Parâmetros editáveis ficam em `settings.params` (ainda sem tela)
- [x] `worker/metrics.ts` (`recomputeAccounts`): roda ao fim de cada sync e ao ligar vendedor↔ERP; seed da carteira pelo vendedor do último pedido (depois só o gestor muda)
- [x] Telas `Carteira` (busca, filtros, mover em massa) e `Cliente/:id` (ficha, pedidos, mais comprados, categorias nunca compradas). Vendedor só vê a própria carteira
- [x] Planos do SaaS (Essencial/Profissional/Distribuidor), limite de vendedores no servidor, rota de administração da plataforma (`/api/admin/tenants`). Falta: cobrança (Asaas), tela de admin, limite de clientes só informativo

## Sprint 4 — Agenda e contato (semana 5)
- [x] `GET /agenda` + tela `Hoje` (contas vencidas + tarefas, 1 item por cliente, mensagem de WhatsApp já pronta; gestor vê `?escopo=todos`, inclusive clientes sem dono)
- [x] Registrar contato (resultado → próximo contato: orçamento 3 d, não respondeu 2 d, sem interesse 30 d, reagendar = data) + histórico na ficha; WhatsApp `wa.me` com modelos editáveis (Configurações)
- [x] Tarefas D+1 e D+7 geradas ao fim de cada sync (só pedidos dos últimos 10 dias). Recompra e reativação **não são tarefas**: já entram na agenda pelo status/score da conta, com o modelo certo
- [x] Página pública `/nps/:token` e tarefa "Tratar insatisfação" (nota ≤ 6, topo da agenda do dono; gestor vê em "todos"). Falta alerta ativo ao gestor (e-mail/push) e relatório de NPS (Sprint 7)
- [ ] **Piloto com 1 vendedor**

## Sprint 5 — Catálogo e pré-pedido (semana 6)
- [x] Catálogo com preço da tabela do cliente (busca, categoria, marca; sem custo/margem; imagens ainda não, dependem do R2) — plano Profissional ou acima
- [x] Pré-pedido (carrinho no navegador → rascunho no servidor com preços refeitos pelo servidor), resumo para copiar/WhatsApp, edição, exclusão
- [x] Envio ao ERP via `PUT /pedido` atrás de `pedido_write_enabled` (padrão desligado → `PENDENTE_FLAG`), tentativa única, `ENVIANDO` reservado antes da chamada, gestor resolve pedido travado. **Falta homologar com a Rein** os códigos de natureza, uso, presença e meio de pagamento (Configurações → Envio de pedido ao ERP) e o formato real da resposta do PUT

## Sprint 6 — Leads (semana 7)
- [x] Formulário público `/seja-revendedor/:slug` (por empresa; só Profissional+; isca anti-robô, 3 pedidos/dia por telefone, 200/dia por empresa) + BrasilAPI + dedupe por CNPJ (índice único de lead aberto)
- [x] Rodízio circular entre vendedores ativos, kanban (Novo → Contatado → Catálogo enviado → Negociando → Convertido/Perdido com motivo), follow-up (2–3 dias) na tela Hoje
- [x] Conversão automática no primeiro pedido (cliente passa para a carteira do vendedor do lead, com histórico); "Cadastrar no ERP" atrás de `pessoa_write_enabled`. **Falta homologar com a Rein** o id do tipo de cliente "Prospect" e os campos obrigatórios do `PUT /pessoa`

## Sprint 7 — Gestor e go-live (semana 8)
- [x] Painel do gestor (`/painel`, plano Distribuidor): positivação, faturamento, ticket, status, contatos feitos × na fila, leads por etapa, NPS, série de 12 meses
- [x] Redistribuição em massa por filtro (só admin, com prévia e histórico); parâmetros editáveis em Configurações; modelos de mensagem já eram editáveis
- [x] Guia de deploy/backup/piloto (`docs/05-deploy.md`), `npm run backup`, CI, PWA instalável. **Pendente (pessoas):** executar o deploy, escolher o domínio, treinar os 4 vendedores
- [x] Comparativo 60 dias × 60 dias anteriores no Painel (positivação, reativados, leads convertidos, contatos). **Pendente:** registrar os números antes do piloto

## Carteira e ERP (decisão do Augusto/Neto, após a Sprint 6)
- [x] O ERP manda na carteira (campo do vendedor configurável; sem ele, semente pelo último pedido)
- [x] Só o admin troca cliente/lead de carteira; leads seguem a carteira do cliente; na conversão o ERP vence
- [x] Troca no app → fila → ERP (atrás de `pessoa_write_enabled` e do campo configurado), com espelho atualizado e proteção contra o ERP antigo desfazer a troca
- [ ] **Falta a Rein confirmar** o campo do vendedor e o formato do `POST /pessoa/{id}` (perguntas 11 e 12 de `docs/02-api-rein.md`)

## Itens que ficaram depois do MVP (feitos em seguida)
- [x] Cobrança dos planos (Asaas) · [x] Administração da plataforma · [x] Imagens de produto (R2) · [x] Página de apresentação
- [x] Recuperação de senha por e-mail · [ ] Aviso por e-mail ao gestor

## Fase 2 (pós-MVP)
WhatsApp Cloud API + disparos automáticos · agente de IA no WhatsApp (consulta catálogo, monta pré-pedido para aprovação) ·
estoque/financeiro/NF-e quando a Rein expuser · RMA · comissão por positivação · multi-tenant para outros distribuidores Ctrl-e.
