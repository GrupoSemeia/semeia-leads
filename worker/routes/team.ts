import { Hono } from 'hono'
import { recomputeAccounts } from '../metrics'
import { type App, tenantOf, requireRole, randomToken, sha256, clean, fail, audit, assertVagaVendedor } from '../lib'

export const team = new Hono<App>()
team.use('*', requireRole('manager'))

team.get('/', async c => {
  const t = tenantOf(c)
  const members = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, m.role, m.active, m.rein_user_id, m.whatsapp FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id = ? ORDER BY u.name`).bind(t).all()
  const invites = await c.env.DB.prepare(
    "SELECT email, role, expires_at FROM invites WHERE tenant_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY expires_at DESC").bind(t, new Date().toISOString()).all()
  return c.json({ membros: members.results, convites: invites.results })
})

team.post('/invites', async c => {
  const t = tenantOf(c), b = await c.req.json<any>()
  const email = clean(b.email, 120).toLowerCase(), role = ['manager', 'seller'].includes(b.papel) ? b.papel : 'seller'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, 'E-mail inválido.')
  if (role === 'seller') await assertVagaVendedor(c.env.DB, t)
  const token = randomToken(24)
  await c.env.DB.prepare('INSERT INTO invites (id, tenant_id, email, role, expires_at) VALUES (?,?,?,?,?)')
    .bind(await sha256(token), t, email, role, new Date(Date.now() + 7 * 864e5).toISOString()).run()
  await audit(c.env.DB, t, c.get('session').userId, 'invite.create', { email, role })
  return c.json({ link: `${new URL(c.req.url).origin}/convite/${token}` })   // o banco guarda só o hash
})

team.patch('/:userId', async c => {
  const t = tenantOf(c), b = await c.req.json<any>(), uid = c.req.param('userId')
  const me = c.get('session')
  if (uid === me.userId && b.ativo === false) throw fail(400, 'Você não pode desativar o próprio acesso.')
  const m = await c.env.DB.prepare('SELECT role FROM members WHERE tenant_id = ? AND user_id = ?').bind(t, uid).first<any>()
  if (!m) throw fail(404, 'Pessoa não encontrada.')
  if (m.role === 'admin' && me.role !== 'admin') throw fail(403, 'Só um administrador altera outro administrador.')
  const role = ['manager', 'seller'].includes(b.papel) && m.role !== 'admin' ? b.papel : m.role
  if (role === 'seller' && b.ativo !== false) await assertVagaVendedor(c.env.DB, t, uid)   // reativar ou virar vendedor ocupa uma vaga
  await c.env.DB.prepare('UPDATE members SET role = ?, active = ?, rein_user_id = ?, whatsapp = ? WHERE tenant_id = ? AND user_id = ?')
    .bind(role, b.ativo === false ? 0 : 1, Number.isInteger(b.reinUsuarioId) ? b.reinUsuarioId : null, clean(b.whatsapp, 30), t, uid).run()
  await audit(c.env.DB, t, me.userId, 'member.update', { uid })
  if (b.reinUsuarioId !== undefined) await recomputeAccounts(c.env.DB, t)   // vínculo novo → clientes sem dono caem na carteira de quem vendeu por último
  return c.json({ ok: true })
})

/** Vendedores do ERP (para ligar cada pessoa da equipe ao vendedor dos pedidos). */
team.get('/vendedores-erp', async c => {
  const r = await c.env.DB.prepare('SELECT rein_id AS id, name FROM rein_usuarios WHERE tenant_id=? AND deleted_at IS NULL ORDER BY name').bind(tenantOf(c)).all()
  return c.json({ itens: r.results })
})
