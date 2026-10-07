/** Cobrança: aplicar pagamento, reconciliar com a Asaas e barrar contas sem acesso. */
import type { MiddlewareHandler } from 'hono'
import { type App, type Env } from './lib'
import { chamarAsaas } from './asaas'
import { acessoLiberado, efeitoDoEvento, pagoAte, type Acesso, type Ciclo } from './domain/cobranca'

const centavos = (v: unknown) => Math.round(Number(v || 0) * 100)

export async function estadoDaConta(db: D1Database, tenantId: string) {
  const r = await db.prepare(
    `SELECT t.plan, t.tier, t.trial_until, t.extra_sellers, s.status AS sub_status, s.paid_until FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id WHERE t.id = ?`).bind(tenantId).first<any>()
  if (!r) return null
  const acesso = acessoLiberado({ plan: r.plan, trialUntil: r.trial_until, assinatura: r.sub_status ? { status: r.sub_status, pagoAte: r.paid_until } : null }, new Date())
  return { ...r, acesso } as { plan: string; tier: string; trial_until: string | null; extra_sellers: number; sub_status: string | null; paid_until: string | null; acesso: Acesso }
}
export const MENSAGEM_BLOQUEIO: Record<string, string> = {
  teste_acabou: 'O teste grátis acabou. Escolha um plano para continuar usando. Seus dados estão guardados.',
  sem_pagamento: 'Não identificamos o pagamento da sua assinatura. Regularize para voltar a usar. Seus dados estão guardados.',
  cancelado: 'Sua assinatura foi cancelada e o período pago terminou. Contrate de novo para voltar. Seus dados estão guardados.',
  suspenso: 'Esta conta está suspensa. Fale com o Grupo Semeia Digital.',
}

/** Em toda rota logada (menos assinatura/admin): conta sem acesso recebe 402. Os dados continuam guardados. */
export const exigirContaLiberada: MiddlewareHandler<App> = async (c, next) => {
  if (c.req.path.startsWith('/api/assinatura') || c.req.path.startsWith('/api/admin')) return next()
  const e = await estadoDaConta(c.env.DB, c.get('session').tenantId)
  if (e && !e.acesso.liberado) return c.json({ erro: MENSAGEM_BLOQUEIO[e.acesso.motivo] ?? 'Acesso bloqueado.', bloqueado: true, motivo: e.acesso.motivo }, 402)
  return next()
}

export async function salvarPagamento(db: D1Database, tenantId: string, p: any) {
  await db.prepare(`INSERT INTO payments (id, tenant_id, value, status, due_date, paid_at, invoice_url, billing_type) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET value=excluded.value, status=excluded.status, due_date=excluded.due_date, paid_at=COALESCE(excluded.paid_at, payments.paid_at), invoice_url=excluded.invoice_url, billing_type=excluded.billing_type, updated_at=datetime('now')
      WHERE payments.tenant_id = excluded.tenant_id`)
    .bind(String(p.id), tenantId, centavos(p.value), String(p.status ?? ''), String(p.dueDate ?? '').slice(0, 10), p.paymentDate || p.clientPaymentDate || p.confirmedDate || null, String(p.invoiceUrl ?? ''), String(p.billingType ?? '')).run()
}

/** Pagamento confirmado: o plano escolhido passa a valer e o acesso vai até o fim do período pago. */
export async function aplicarPagamento(db: D1Database, sub: any, cobranca: any) {
  const ate = pagoAte(String(cobranca.dueDate).slice(0, 10), sub.cycle as Ciclo)
  await db.batch([
    db.prepare(`UPDATE subscriptions SET status='ativa', paid_until = CASE WHEN paid_until IS NULL OR paid_until < ?1 THEN ?1 ELSE paid_until END, updated_at=datetime('now') WHERE tenant_id=?2`).bind(ate, sub.tenant_id),
    db.prepare("UPDATE tenants SET tier=?, extra_sellers=?, plan='ativo' WHERE id=? AND plan <> 'suspenso'").bind(sub.tier, sub.extra_sellers, sub.tenant_id),
  ])
}

/** Aplica um evento da Asaas (webhook ou reconciliação). Eventos de assinaturas que não são nossas são ignorados. */
export async function tratarEvento(db: D1Database, evento: string, corpo: { payment?: any; subscription?: any }) {
  const efeito = efeitoDoEvento(evento, corpo.payment?.status)
  if (efeito === 'cancelado' && corpo.subscription?.id) {
    await db.prepare("UPDATE subscriptions SET status='cancelada', updated_at=datetime('now') WHERE asaas_subscription_id=?").bind(String(corpo.subscription.id)).run()
    return
  }
  const p = corpo.payment
  if (!p?.id || !p.subscription) return
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE asaas_subscription_id=?').bind(String(p.subscription)).first<any>()
  if (!sub) return
  await salvarPagamento(db, sub.tenant_id, p)
  if (efeito === 'pago') await aplicarPagamento(db, sub, p)
  else if (efeito === 'atrasado') await db.prepare("UPDATE subscriptions SET status='atrasada', updated_at=datetime('now') WHERE tenant_id=? AND status='ativa'").bind(sub.tenant_id).run()
}

/** "Já paguei": busca as cobranças na Asaas e aplica as pagas (cobre webhook perdido). */
export async function reconciliar(env: Env, tenantId: string): Promise<void> {
  const sub = await env.DB.prepare('SELECT * FROM subscriptions WHERE tenant_id=?').bind(tenantId).first<any>()
  if (!sub || !env.ASAAS_API_KEY) return
  const r = await chamarAsaas(env, 'GET', `subscriptions/${sub.asaas_subscription_id}/payments`)
  if (!r.ok) return
  for (const p of (r.dados?.data ?? []) as any[]) await tratarEvento(env.DB, p.status === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_UPDATED', { payment: { ...p, subscription: sub.asaas_subscription_id } })
}
