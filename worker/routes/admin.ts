import { Hono } from 'hono'
import { type App, requirePlatformAdmin, fail, audit } from '../lib'
import { ehTier, PLANOS } from '../plans'
import { acessoLiberado } from '../domain/cobranca'
import { receitaMensal, estenderTeste, ultimoLoginDe, resumoPlataforma, type LinhaEmpresa } from '../domain/plataforma'

/**
 * Administração da plataforma (Grupo Semeia). Única parte que não filtra por tenant: lista as empresas, mostra uso e cobrança e muda plano.
 * NÃO abre clientes, pedidos, leads, preços nem custos de nenhuma empresa: só contagens e estado da conta.
 */
export const admin = new Hono<App>()
admin.use('*', requirePlatformAdmin)

admin.get('/tenants', async c => {
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.slug, t.city, t.whatsapp, t.plan, t.tier, t.extra_sellers AS extraSellers, t.trial_until AS trialUntil, t.created_at AS createdAt,
            (SELECT COUNT(*) FROM members m WHERE m.tenant_id = t.id AND m.active = 1) AS membros,
            (SELECT COUNT(*) FROM members m WHERE m.tenant_id = t.id AND m.active = 1 AND m.role = 'seller') AS vendedores,
            (SELECT COUNT(*) FROM accounts a WHERE a.tenant_id = t.id) AS clientes,
            (SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = t.id AND m.role = 'admin' ORDER BY m.created_at LIMIT 1) AS dono,
            (SELECT MAX(expires_at) FROM sessions s WHERE s.tenant_id = t.id) AS sessaoMaisNova,
            s.status AS assinaturaStatus, s.paid_until AS pagoAte, s.cycle AS ciclo, s.value AS valorAssinatura, s.tier AS tierAssinado,
            r.mock AS erpTeste, (r.client_id <> '') AS erpConfigurado, r.pessoa_write_enabled AS erpEscrita,
            (SELECT MAX(last_ok_at) FROM sync_state y WHERE y.tenant_id = t.id AND y.job IN ('pedidos', 'backfill', 'cadastros')) AS ultimoSync,
            (SELECT COUNT(*) FROM sync_state y WHERE y.tenant_id = t.id AND y.last_error IS NOT NULL) AS syncComErro
       FROM tenants t LEFT JOIN subscriptions s ON s.tenant_id = t.id LEFT JOIN tenant_rein r ON r.tenant_id = t.id ORDER BY t.created_at DESC`).all<any>()
  const agora = new Date()
  const empresas = rows.results.map((r: any) => {
    const acesso = acessoLiberado({ plan: r.plan, trialUntil: r.trialUntil, assinatura: r.assinaturaStatus ? { status: r.assinaturaStatus, pagoAte: r.pagoAte } : null }, agora)
    const situacao: LinhaEmpresa['situacao'] = r.plan === 'suspenso' ? 'suspensa' : !acesso.liberado ? 'bloqueada' : r.plan === 'trial' ? 'teste' : 'ativa'
    const { sessaoMaisNova, ...resto } = r
    return { ...resto, situacao, acessoMotivo: acesso.motivo, testeAcabaEmDias: r.plan === 'trial' ? acesso.diasDeTeste : null, aviso: acesso.aviso, ultimoLogin: ultimoLoginDe(sessaoMaisNova), erpTeste: !!r.erpTeste, erpConfigurado: !!r.erpConfigurado, erpEscrita: !!r.erpEscrita }
  })
  const mrr = receitaMensal(rows.results.filter((r: any) => r.assinaturaStatus).map((r: any) => ({ status: r.assinaturaStatus, cycle: r.ciclo, value: r.valorAssinatura })))
  return c.json({ resumo: resumoPlataforma(empresas, mrr), empresas, planos: PLANOS })
})

/** Muda plano, situação, vendedores extras e teste de uma empresa. Cada mudança fica na auditoria da empresa, com quem fez. */
admin.patch('/tenants/:id', async c => {
  const id = c.req.param('id'), b = await c.req.json<any>().catch(() => ({})), db = c.env.DB
  const cur = await db.prepare('SELECT plan, tier, extra_sellers, trial_until FROM tenants WHERE id=?').bind(id).first<any>()
  if (!cur) throw fail(404, 'Empresa não encontrada.')
  const tier = b.tier === undefined ? cur.tier : b.tier, plan = b.plan === undefined ? cur.plan : b.plan
  if (!ehTier(tier)) throw fail(400, 'Plano inválido.')
  if (!['trial', 'ativo', 'suspenso'].includes(plan)) throw fail(400, 'Situação inválida.')
  const extra = b.extraSellers === undefined ? cur.extra_sellers : Number(b.extraSellers)
  if (!Number.isInteger(extra) || extra < 0 || extra > 1000) throw fail(400, 'Vendedores adicionais: de 0 a 1000.')
  let trial: string | null = cur.trial_until
  if (b.estenderTesteDias !== undefined) { const e = estenderTeste(cur.trial_until, b.estenderTesteDias, new Date()); if (!e.ok) throw fail(400, e.erro); trial = e.novo }
  else if (b.trialUntil !== undefined) { const d = b.trialUntil ? new Date(b.trialUntil) : null; if (d && Number.isNaN(d.getTime())) throw fail(400, 'Data inválida.'); trial = d ? d.toISOString() : null }
  if (b.estenderTesteDias !== undefined && b.plan === undefined && cur.plan !== 'trial') throw fail(400, 'Só empresa em teste grátis tem o teste estendido.')
  await db.prepare('UPDATE tenants SET tier=?, plan=?, extra_sellers=?, trial_until=? WHERE id=?').bind(tier, plan, extra, trial, id).run()
  await audit(db, id, c.get('session').userId, 'admin.tenant.update', { de: { plan: cur.plan, tier: cur.tier, extra: cur.extra_sellers, trial: cur.trial_until }, para: { plan, tier, extra, trial }, porPlataforma: true })
  return c.json({ ok: true })
})
