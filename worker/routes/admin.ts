import { Hono } from 'hono'
import { type App, requirePlatformAdmin, fail, audit } from '../lib'
import { ehTier, PLANOS } from '../plans'

/** Administração da plataforma (Grupo Semeia). Única parte que não filtra por tenant: lista empresas e muda plano. Não abre dados de negócio. */
export const admin = new Hono<App>()
admin.use('*', requirePlatformAdmin)

admin.get('/tenants', async c => {
  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.slug, t.city, t.whatsapp, t.plan, t.tier, t.extra_sellers AS extraSellers, t.trial_until AS trialUntil, t.created_at AS createdAt,
            (SELECT COUNT(*) FROM members m WHERE m.tenant_id = t.id AND m.active = 1) AS membros,
            (SELECT COUNT(*) FROM accounts a WHERE a.tenant_id = t.id) AS clientes,
            (SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = t.id AND m.role = 'admin' ORDER BY m.created_at LIMIT 1) AS dono
       FROM tenants t ORDER BY t.created_at DESC`).all()
  return c.json({ empresas: rows.results, planos: PLANOS })
})

admin.patch('/tenants/:id', async c => {
  const id = c.req.param('id'), b = await c.req.json<any>(), db = c.env.DB
  const cur = await db.prepare('SELECT plan, tier, extra_sellers, trial_until FROM tenants WHERE id=?').bind(id).first<any>()
  if (!cur) throw fail(404, 'Empresa não encontrada.')
  const tier = b.tier === undefined ? cur.tier : b.tier, plan = b.plan === undefined ? cur.plan : b.plan
  if (!ehTier(tier)) throw fail(400, 'Plano inválido.')
  if (!['trial', 'ativo', 'suspenso'].includes(plan)) throw fail(400, 'Situação inválida.')
  const extra = b.extraSellers === undefined ? cur.extra_sellers : Math.max(0, Math.floor(Number(b.extraSellers) || 0))
  const trial = b.trialUntil === undefined ? cur.trial_until : (b.trialUntil ? new Date(b.trialUntil).toISOString() : null)
  await db.prepare('UPDATE tenants SET tier=?, plan=?, extra_sellers=?, trial_until=? WHERE id=?').bind(tier, plan, extra, trial, id).run()
  await audit(db, id, c.get('session').userId, 'admin.tenant.update', { tier, plan, extra, trial })
  return c.json({ ok: true })
})
