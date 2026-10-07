# Produto — MVP Carteira AC3

## 1. Problema

A AC3 tem ~1.000 clientes B2B (lojas de informática, assistências técnicas, integradores) atendidos por
4 vendedores via WhatsApp. Não há visão de carteira por vendedor, nem priorização de quem contatar,
nem rotina de pós-venda e reativação. Leads novos chegam sem dono e sem acompanhamento.

## 2. Objetivo do MVP (8 semanas)

Colocar no celular de cada vendedor **"quem eu devo contatar hoje e o que oferecer"**, com base no
histórico real de pedidos do ERP, e dar ao gestor a visão de positivação da carteira.

Métricas de sucesso (medir 60 dias após go-live, comparando com os 60 dias anteriores):
- **Positivação mensal** (% de clientes da carteira que compraram no mês) ↑
- **Clientes reativados** (inativos >180 dias que voltaram a comprar)
- **Leads convertidos** em 1ª compra
- **Adoção**: ≥ 80% dos contatos da agenda marcados como feitos

## 3. Personas

| Persona | Papel | Precisa de |
|---|---|---|
| **Vendedor** (4) | `VENDEDOR` | Agenda do dia, ficha do cliente, catálogo com preço, WhatsApp em 1 toque, registrar contato |
| **Gestor** (Augusto / gerente) | `GESTOR` | Indicadores por vendedor, clientes em risco, distribuir carteira e leads |
| **Admin** (Semeia) | `ADMIN` | Configurar integração, usuários, parâmetros de regras, ver logs de sync |

## 4. Escopo do MVP

### M2 — Carteira e venda (prioridade 1)

- **US-01 Agenda do dia**: como vendedor, vejo até 25 clientes para contatar hoje, ordenados por prioridade,
  com motivo ("Curva A — 9 dias sem contato", "Em risco — 112 dias sem comprar", "Recompra prevista").
- **US-02 Registrar contato**: marco o contato como feito com resultado (`Vendeu`, `Orçamento`, `Sem interesse agora`,
  `Não respondeu`, `Reagendar p/ data`) e observação. Isso define a próxima data de contato.
- **US-03 Ficha do cliente**: dados do ERP (razão social, CNPJ, cidade, WhatsApp, tabela de preço, limite de crédito),
  curva ABC, status, ticket médio, frequência média, últimos 10 pedidos, top produtos/categorias,
  **categorias que nunca comprou** e timeline de interações.
- **US-04 WhatsApp em 1 toque**: botão abre `wa.me/<numero>?text=<modelo>` com modelos (saudação, oferta, recompra,
  reativação, pós-venda). O clique registra uma interação.
- **US-05 Catálogo**: busca por nome/SKU/categoria/marca, mostra imagem e **preço da tabela do cliente selecionado**;
  "Enviar no WhatsApp" compartilha nome + preço + link do produto no site.
- **US-06 Pré-pedido**: monto carrinho para um cliente e salvo como pré-pedido. Com `REIN_PEDIDO_WRITE_ENABLED=true`,
  envio ao ERP (canal "App Carteira"); com `false`, gera resumo para copiar/colar no WhatsApp e no ERP.
- **US-07 Minha carteira**: lista filtrável (curva, status, cidade, categoria) com busca.

### M1 — Leads (prioridade 2, versão simples)

- **US-10 Cadastro de lead**: formulário público (`/seja-revendedor`) + cadastro manual pelo vendedor.
  Campos: CNPJ, razão social, nome do contato, WhatsApp, cidade/UF, segmento, origem.
  CNPJ é validado (dígitos) e enriquecido via BrasilAPI (`/cnpj/v1/{cnpj}`).
- **US-11 Deduplicação**: se o CNPJ já existe no espelho do ERP → alerta "já é cliente de <vendedor>".
- **US-12 Distribuição**: rodízio automático entre vendedores ativos (gestor pode reatribuir).
- **US-13 Funil kanban**: `Novo → Contatado → Catálogo enviado → Negociando → Convertido | Perdido(motivo)`.
- **US-14 Conversão automática**: quando o sync encontra o 1º pedido de um CNPJ de lead → `Convertido`, vira cliente da carteira do vendedor do lead.
- (Com `REIN_PESSOA_WRITE_ENABLED`) botão "Cadastrar no ERP" cria a pessoa via `PUT /pessoa`.

### M3 — Pós-venda (prioridade 3, baseado em tarefas)

- **US-20 Tarefas automáticas** geradas pelo sync quando entra um pedido novo:
  - D+1 "Confirmar recebimento/agradecer" (modelo WhatsApp)
  - D+7 "Pesquisa de satisfação" — vendedor envia link curto; cliente responde nota 0–10 (página pública `/nps/<token>`)
- **US-21 Nota ≤ 6** cria tarefa "Tratar insatisfação" para o vendedor e alerta o gestor.
- **US-22 Recompra prevista**: cliente com ≥ 3 pedidos entra na agenda quando `dias desde último pedido ≥ 0,9 × intervalo médio`.
- **US-23 Reativação**: clientes que viram `EM_RISCO` ou `INATIVO` entram na agenda com motivo e modelo de reativação.

### Gestor

- **US-30 Painel**: por vendedor e total — positivação do mês, faturamento do mês, ticket médio, nº clientes por status,
  contatos feitos x planejados, leads por etapa, NPS.
- **US-31 Redistribuir carteira**: mover clientes entre vendedores (individual ou em massa por filtro), com histórico.
- **US-32 Parâmetros**: dias de status, frequência por curva, tamanho da agenda.

## 5. Telas (PWA, mobile-first)

Vendedor: `Hoje` (agenda) · `Carteira` · `Cliente/:id` · `Catálogo` · `Pré-pedido` · `Leads` (kanban) · `Perfil`.
Gestor (web, desktop-first): `Painel` · `Vendedores` · `Carteiras` · `Leads` · `NPS` · `Configurações` · `Sync/Logs` (admin).
Públicas: `/seja-revendedor` · `/nps/:token`.

Navegação vendedor: bottom bar com Hoje · Carteira · Catálogo · Leads.

## 6. Critérios de aceite gerais

- Agenda carrega em < 2 s com 250 clientes na carteira.
- Dados do ERP com no máximo 15 min de atraso para pedidos e 24 h para cadastros/produtos.
- Vendedor só vê a própria carteira e os próprios leads; gestor vê tudo.
- Custo e margem de produto nunca chegam ao front do vendedor.
- Funciona em Android/iOS como PWA instalável.

## 7. Fora do escopo do MVP (fase 2+)

WhatsApp Cloud API e disparos automáticos · agente de IA no WhatsApp · saldo de estoque, financeiro, NF-e, rastreio
(dependem da Rein) · RMA · app nativo · multi-empresa em produção · campanhas em massa · comissão.
