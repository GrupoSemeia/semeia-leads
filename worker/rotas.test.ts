import { describe, it, expect } from 'vitest'
import { app } from './index'

/**
 * Contrato das rotas da API: se alguém (ou uma edição apressada) apagar uma rota, este teste falha.
 * Motivo: uma troca de arquivo já cortou, sem o TypeScript reclamar, as rotas de registrar contato e mensagem do WhatsApp.
 */
const ESPERADAS = [
  'POST /api/auth/signup', 'POST /api/auth/login', 'GET /api/auth/me', 'POST /api/auth/switch-tenant', 'POST /api/auth/invite/:token',
  'GET /api/publico/nps/:token', 'POST /api/publico/nps/:token', 'GET /api/publico/revendedor/:slug', 'POST /api/publico/revendedor/:slug',
  'GET /api/equipe', 'POST /api/equipe/invites', 'PATCH /api/equipe/:userId',
  'GET /api/rein', 'PUT /api/rein', 'POST /api/rein/test', 'GET /api/rein/pedido', 'PUT /api/rein/pedido', 'GET /api/rein/pessoa', 'PUT /api/rein/pessoa',
  'GET /api/sync', 'POST /api/sync/:job/run',
  'GET /api/accounts', 'GET /api/accounts/:id{[0-9]+}', 'POST /api/accounts/recompute', 'POST /api/accounts/reassign', 'POST /api/accounts/reassign-filtro',
  'GET /api/accounts/erp-pendencias', 'POST /api/accounts/erp-pendencias/processar', 'POST /api/accounts/erp-pendencias/:id/resolver',
  'POST /api/accounts/:id{[0-9]+}/interactions', 'POST /api/accounts/:id{[0-9]+}/whatsapp-click', 'GET /api/accounts/:id{[0-9]+}/mensagem',
  'GET /api/agenda', 'GET /api/templates', 'PUT /api/templates/:key',
  'GET /api/catalogo', 'GET /api/catalogo/filtros', 'GET /api/pre-pedidos', 'POST /api/pre-pedidos', 'GET /api/pre-pedidos/:id', 'PUT /api/pre-pedidos/:id', 'DELETE /api/pre-pedidos/:id', 'POST /api/pre-pedidos/:id/enviar', 'POST /api/pre-pedidos/:id/resolver',
  'GET /api/leads', 'POST /api/leads', 'GET /api/leads/:id', 'PATCH /api/leads/:id', 'POST /api/leads/:id/push-erp', 'POST /api/leads/:id/erp-resolver',
  'GET /api/assinatura', 'POST /api/assinatura', 'POST /api/assinatura/cancelar', 'POST /api/assinatura/atualizar', 'POST /api/asaas/webhook',
  'GET /api/painel', 'GET /api/painel/comparativo', 'GET /api/parametros', 'PUT /api/parametros', 'GET /api/admin/tenants', 'PATCH /api/admin/tenants/:id',
]

describe('contrato das rotas da API', () => {
  const existentes = new Set(app.routes.map(r => `${r.method} ${r.path}`))
  it.each(ESPERADAS)('%s existe', rota => { expect(existentes.has(rota), `rota sumiu: ${rota}`).toBe(true) })
})
