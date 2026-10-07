# Roadmap MVP — 8 semanas

> Plataforma: Cloudflare (Worker + D1 + R2 + Cron/Queues), SaaS multi-tenant. Ver CLAUDE.md.

Marque `[x]` ao concluir. Cada sprint termina com algo demonstrável à AC3.

## Sprint 0 — Fundação (semana 1)
- [x] Projeto único (Worker Hono + SPA React/Vite), TS estrito, vitest (`worker/rein/`, depois `worker/domain/`)
- [x] D1 `semeia-leads` + migração 0001 (tenants, users, members, sessions, invites, tenant_rein, settings, sync_runs, audit_log); tabelas do espelho/domínio entram nas migrações das sprints 2–3
- [x] Auth (cadastro de empresa com 14 dias, login, convite da equipe, troca de empresa), papéis admin/manager/seller, shell responsivo
- [ ] PWA instalável (manifest + service worker) e bottom bar do vendedor
- [x] `.dev.vars.example`; seção "Comandos" do CLAUDE.md atualizada
- [x] Tela de Configurações: conexão com o ERP (segredo criptografado) e equipe
- [ ] CI (typecheck + test + build) no GitHub Actions
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
- [ ] Extração de imagens de produto para R2 (hoje a imagem é descartada do `raw`; R2 ainda não criado)
- [x] Painel "Sincronização" em Configurações (contagens, botões, progresso, último erro). Falta tela de logs detalhada e visão de plataforma
- [ ] Mapeamento `User.reinUsuarioId` (tela de usuários)

## Sprint 3 — Domínio e carteira (semana 4)
- [ ] `packages/domain`: status, ABC, frequência, score, agenda, recompra, positivação (testes)
- [ ] `metrics.recompute` + seed de carteira pelo último vendedor
- [ ] Telas `Carteira` e `Cliente/:id` (ficha, pedidos, top produtos, categorias nunca compradas)

## Sprint 4 — Agenda e contato (semana 5)
- [ ] `GET /agenda` + tela `Hoje`
- [ ] Registrar interação + reagendar; WhatsApp `wa.me` com templates
- [ ] `tasks.generate` (pós-venda D+1, NPS D+7, recompra, reativação)
- [ ] Página pública NPS e tarefa "Tratar insatisfação"
- [ ] **Piloto com 1 vendedor**

## Sprint 5 — Catálogo e pré-pedido (semana 6)
- [ ] Catálogo com preço da tabela do cliente (sem custo/margem para vendedor)
- [ ] Pré-pedido (carrinho), resumo para WhatsApp
- [ ] Envio ao ERP via `PUT /pedido` atrás de `REIN_PEDIDO_WRITE_ENABLED` (homologar com Rein antes de ligar)

## Sprint 6 — Leads (semana 7)
- [ ] Formulário público `/seja-revendedor` + BrasilAPI + dedupe por CNPJ
- [ ] Rodízio, kanban, follow-up
- [ ] `leads.convert` automático; "Cadastrar no ERP" atrás de `REIN_PESSOA_WRITE_ENABLED`

## Sprint 7 — Gestor e go-live (semana 8)
- [ ] Painel do gestor (positivação, faturamento, ticket, status, contatos, leads, NPS)
- [ ] Redistribuição de carteira com histórico; parâmetros e templates editáveis
- [ ] Deploy produção, backups, domínio; treinamento dos 4 vendedores
- [ ] Baseline das métricas de sucesso (60 dias anteriores)

## Fase 2 (pós-MVP)
WhatsApp Cloud API + disparos automáticos · agente de IA no WhatsApp (consulta catálogo, monta pré-pedido para aprovação) ·
estoque/financeiro/NF-e quando a Rein expuser · RMA · comissão por positivação · multi-tenant para outros distribuidores Ctrl-e.
