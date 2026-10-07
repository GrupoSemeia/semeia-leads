import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail, igualConstante, audit } from '../lib'
import { chamarAsaas, type RespostaAsaas } from '../asaas'
import { PLANOS, VENDEDOR_EXTRA, MESES_PAGOS_NO_ANO } from '../plans'
import { validarPedidoAssinatura, valorDaAssinatura, primeiroVencimento, diaLocal } from '../domain/cobranca'
import { estadoDaConta, salvarPagamento, tratarEvento, reconciliar, MENSAGEM_BLOQUEIO } from '../billing'

export const assinatura = new Hono<App>()
assinatura.use('*', requireRole())   // dinheiro e plano: só o administrador da empresa

const exigir = (r: RespostaAsaas) => { if (!r.ok) throw fail(502, r.erro); return r.dados }
const descricao = (tier: keyof typeof PLANOS, extra: number, ciclo: string) => `Semeia Leads · plano ${PLANOS[tier].nome}${extra ? ` + ${extra} vendedor(es) adicional(is)` : ''}${ciclo === 'YEARLY' ? ' · anual' : ''}`

async function visao(c: any) {
  const t = tenantOf(c), db: D1Database = c.env.DB
  const [sub, pagamentos, e] = await Promise.all([
    db.prepare('SELECT tier, extra_sellers AS extraSellers, cycle AS ciclo, value AS valor, status, paid_until AS pagoAte FROM subscriptions WHERE tenant_id=?').bind(t).first(),
    db.prepare('SELECT id, value AS valor, status, due_date AS vencimento, paid_at AS pagoEm, invoice_url AS url, billing_type AS forma FROM payments WHERE tenant_id=? ORDER BY due_date DESC LIMIT 12').bind(t).all<any>(),
    estadoDaConta(db, t),
  ])
  const aberto = pagamentos.results.filter((p: any) => p.status === 'PENDING' || p.status === 'OVERDUE').sort((x: any, y: any) => x.vencimento.localeCompare(y.vencimento))[0] ?? null
  return { online: !!c.env.ASAAS_API_KEY, assinatura: sub, aberto, pagamentos: pagamentos.results, acesso: e?.acesso ?? null, mensagem: e && !e.acesso.liberado ? MENSAGEM_BLOQUEIO[e.acesso.motivo] : null,
    precos: { planos: Object.fromEntries(Object.entries(PLANOS).map(([k, p]) => [k, { nome: p.nome, preco: p.preco, vendedores: p.vendedores, clientes: p.clientes, resumo: p.resumo }])), vendedorExtra: VENDEDOR_EXTRA, mesesPagosNoAno: MESES_PAGOS_NO_ANO } }
}
assinatura.get('/', async c => c.json(await visao(c)))

/** Contrata ou muda o plano e devolve o link de pagamento da Asaas. O plano só vale com o pagamento confirmado (primeira vez). */
assinatura.post('/', async c => {
  const t = tenantOf(c), db = c.env.DB, s = c.get('session'), body = await c.req.json<any>().catch(() => null)
  if (!c.env.ASAAS_API_KEY) throw fail(400, 'O pagamento online ainda não foi ativado. Fale com o Grupo Semeia Digital para mudar de plano.')
  const atual = await db.prepare('SELECT * FROM subscriptions WHERE tenant_id=?').bind(t).first<any>()
  const mudando = !!atual && atual.status !== 'cancelada'
  const v = validarPedidoAssinatura(body, !mudando); if (!v.ok) throw fail(400, v.erro)
  const { tier, extraSellers, ciclo, cpfCnpj } = v.pedido
  if (mudando && body.ciclo !== undefined && ciclo !== atual.cycle) throw fail(400, 'Não dá para trocar entre mensal e anual numa assinatura ativa. Cancele e contrate de novo no fim do período pago.')
  const valor = valorDaAssinatura(tier, extraSellers, mudando ? atual.cycle : ciclo), cicloFinal = mudando ? atual.cycle : ciclo
  const tenant = await db.prepare('SELECT name, whatsapp, trial_until FROM tenants WHERE id=?').bind(t).first<any>()
  let subId: string

  if (mudando) {
    subId = atual.asaas_subscription_id
    exigir(await chamarAsaas(c.env, 'POST', `subscriptions/${subId}`, { value: valor / 100, description: descricao(tier, extraSellers, cicloFinal), updatePendingPayments: true }))
    await db.prepare("UPDATE subscriptions SET tier=?, extra_sellers=?, value=?, updated_at=datetime('now') WHERE tenant_id=?").bind(tier, extraSellers, valor, t).run()
    // em dia: o plano novo vale já e o valor novo entra na próxima cobrança
    if (atual.status === 'ativa') await db.prepare("UPDATE tenants SET tier=?, extra_sellers=? WHERE id=? AND plan <> 'suspenso'").bind(tier, extraSellers, t).run()
  } else {
    const dados = { name: tenant.name, cpfCnpj, email: s.email, mobilePhone: String(tenant.whatsapp ?? '').replace(/\D/g, '') || undefined, externalReference: t }
    const cliente: string = atual?.asaas_customer_id ?? exigir(await chamarAsaas(c.env, 'POST', 'customers', dados)).id
    const hoje = diaLocal(new Date())
    const venc = atual?.paid_until && atual.paid_until > hoje ? atual.paid_until : primeiroVencimento(tenant.trial_until, hoje)   // 1ª cobrança: fim do teste (ou fim do período já pago)
    subId = exigir(await chamarAsaas(c.env, 'POST', 'subscriptions', { customer: cliente, billingType: 'UNDEFINED', value: valor / 100, nextDueDate: venc, cycle: cicloFinal, description: descricao(tier, extraSellers, cicloFinal), externalReference: t })).id
    await db.prepare(`INSERT INTO subscriptions (tenant_id, asaas_customer_id, asaas_subscription_id, tier, extra_sellers, cycle, value, status, paid_until) VALUES (?,?,?,?,?,?,?, 'pendente', ?)
        ON CONFLICT(tenant_id) DO UPDATE SET asaas_customer_id=excluded.asaas_customer_id, asaas_subscription_id=excluded.asaas_subscription_id, tier=excluded.tier, extra_sellers=excluded.extra_sellers,
          cycle=excluded.cycle, value=excluded.value, status='pendente', updated_at=datetime('now')`).bind(t, cliente, subId, tier, extraSellers, cicloFinal, valor, atual?.paid_until ?? null).run()
  }
  await audit(db, t, s.userId, mudando ? 'assinatura.mudou' : 'assinatura.criou', { tier, extraSellers, ciclo: cicloFinal, valor })   // sem CPF/CNPJ

  const lista = await chamarAsaas(c.env, 'GET', `subscriptions/${subId}/payments`)
  const cobrancas: any[] = lista.ok ? lista.dados?.data ?? [] : []
  for (const p of cobrancas) await salvarPagamento(db, t, p)
  const aberta = cobrancas.filter(p => p.status === 'PENDING' || p.status === 'OVERDUE').sort((x, y) => String(x.dueDate).localeCompare(String(y.dueDate)))[0]
  return c.json({ ok: true, url: aberta?.invoiceUrl ?? null, mudou: mudando })
})

/** Cancela a renovação. O acesso segue até o fim do período já pago. */
assinatura.post('/cancelar', async c => {
  const t = tenantOf(c), db = c.env.DB
  const sub = await db.prepare('SELECT * FROM subscriptions WHERE tenant_id=?').bind(t).first<any>()
  if (!sub || sub.status === 'cancelada') throw fail(400, 'Não há assinatura ativa para cancelar.')
  exigir(await chamarAsaas(c.env, 'DELETE', `subscriptions/${sub.asaas_subscription_id}`))
  await db.prepare("UPDATE subscriptions SET status='cancelada', updated_at=datetime('now') WHERE tenant_id=?").bind(t).run()
  await audit(db, t, c.get('session').userId, 'assinatura.cancelou', { pagoAte: sub.paid_until })
  return c.json({ ok: true, pagoAte: sub.paid_until })
})

/** "Já paguei": confere na Asaas e libera na hora (cobre webhook que não chegou). */
assinatura.post('/atualizar', async c => { await reconciliar(c.env, tenantOf(c)); return c.json(await visao(c)) })

/* ---------- webhook da Asaas (sem login): confere o token do cabeçalho ---------- */
export const asaasWebhook = new Hono<App>()
asaasWebhook.post('/', async c => {
  const token = c.env.ASAAS_WEBHOOK_TOKEN
  if (!token || !(await igualConstante(c.req.header('asaas-access-token') ?? '', token))) return c.json({ erro: 'Não autorizado.' }, 401)
  const corpo = await c.req.json<any>().catch(() => ({}))
  await tratarEvento(c.env.DB, String(corpo.event ?? ''), corpo)   // cobranças que não são de assinaturas nossas são ignoradas
  return c.json({ ok: true })
})
