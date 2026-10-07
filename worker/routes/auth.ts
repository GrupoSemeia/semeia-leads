import { Hono } from 'hono'
import { type App, loadTenantPlano, newId, hashPassword, checkPassword, createSession, endSession, readSession, clean, slugify, fail, sha256, requireLogin } from '../lib'

import { estadoDaConta, MENSAGEM_BLOQUEIO } from '../billing'
import { PLANOS, VENDEDOR_EXTRA, MESES_PAGOS_NO_ANO, tierEfetivo, nivelDe, limiteVendedores, limiteClientes, emTeste } from '../plans'

export const auth = new Hono<App>()

auth.post('/signup', async c => {
  const b = await c.req.json<any>()
  const company = clean(b.empresa, 80), name = clean(b.nome, 80), email = clean(b.email, 120).toLowerCase(), pw = String(b.senha ?? '')
  if (!company || !name) throw fail(400, 'Informe o nome da empresa e o seu nome.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, 'E-mail inválido.')
  if (pw.length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres.')
  const db = c.env.DB
  if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) throw fail(409, 'Já existe uma conta com este e-mail. Faça login.')
  let slug = slugify(company)
  if (await db.prepare('SELECT 1 FROM tenants WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`
  const tenantId = newId(), userId = newId()
  await db.batch([
    db.prepare('INSERT INTO tenants (id, name, slug, city, whatsapp, plan, trial_until) VALUES (?,?,?,?,?,?,?)')
      .bind(tenantId, company, slug, clean(b.cidade, 80), clean(b.whatsapp, 30), 'trial', new Date(Date.now() + 14 * 864e5).toISOString()),
    db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)').bind(userId, email, name, await hashPassword(pw)),
    db.prepare("INSERT INTO members (tenant_id, user_id, role) VALUES (?,?, 'admin')").bind(tenantId, userId),
    db.prepare('INSERT INTO tenant_rein (tenant_id) VALUES (?)').bind(tenantId),
  ])
  await createSession(c, userId, tenantId)
  return c.json({ ok: true })
})

auth.post('/login', async c => {
  const b = await c.req.json<any>()
  const u = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(clean(b.email, 120).toLowerCase()).first<any>()
  if (!u || !(await checkPassword(String(b.senha ?? ''), u.password_hash))) throw fail(401, 'E-mail ou senha incorretos.')
  const m = await c.env.DB.prepare('SELECT tenant_id FROM members WHERE user_id = ? AND active = 1 ORDER BY created_at LIMIT 1').bind(u.id).first<any>()
  if (!m) throw fail(403, 'Seu usuário não está ligado a nenhuma empresa.')
  await createSession(c, u.id, m.tenant_id)
  return c.json({ ok: true })
})

auth.post('/logout', async c => { await endSession(c); return c.json({ ok: true }) })

auth.get('/me', async c => {
  const s = await readSession(c)
  if (!s) return c.json({ logado: false })
  const db = c.env.DB
  const tenant = await db.prepare('SELECT id, name, slug, city, whatsapp, plan, tier, extra_sellers, trial_until FROM tenants WHERE id = ?').bind(s.tenantId).first<any>()
  const list = await db.prepare('SELECT t.id, t.name, t.city FROM members m JOIN tenants t ON t.id = m.tenant_id WHERE m.user_id = ? AND m.active = 1 ORDER BY t.name').bind(s.userId).all()
  const days = tenant.trial_until ? Math.ceil((new Date(tenant.trial_until).getTime() - Date.now()) / 864e5) : null
  const uso = await db.prepare(`SELECT (SELECT COUNT(*) FROM members WHERE tenant_id=?1 AND role='seller' AND active=1) AS vendedores,
      (SELECT COUNT(*) FROM accounts WHERE tenant_id=?1) AS clientes`).bind(s.tenantId).first<any>()
  const efetivo = tierEfetivo(tenant), conta = await estadoDaConta(db, s.tenantId), acesso = conta?.acesso
  const plano = {
    tier: tenant.tier, efetivo, nome: PLANOS[efetivo].nome, contratado: PLANOS[tenant.tier as keyof typeof PLANOS]?.nome ?? 'Essencial', nivel: nivelDe(tenant), emTeste: emTeste(tenant), suspenso: tenant.plan === 'suspenso',
    limiteVendedores: limiteVendedores(tenant), limiteClientes: limiteClientes(tenant), vendedores: uso?.vendedores ?? 0, clientes: uso?.clientes ?? 0,
    bloqueado: acesso ? !acesso.liberado : false, motivo: acesso?.motivo ?? 'ok', mensagem: acesso && !acesso.liberado ? MENSAGEM_BLOQUEIO[acesso.motivo] : null, aviso: acesso?.aviso ?? null, assinatura: conta?.sub_status ?? null,
    preco: PLANOS[efetivo].preco, vendedorExtra: VENDEDOR_EXTRA, extraContratados: tenant.extra_sellers, mesesPagosNoAno: MESES_PAGOS_NO_ANO,
  }
  return c.json({
    logado: true,
    plano,
    usuario: { id: s.userId, nome: s.name, email: s.email, papel: s.role },
    empresa: tenant,
    empresas: list.results,
    trialDias: tenant.plan === 'trial' && days !== null && days > 0 ? days : null,
    admin: s.platformAdmin,
  })
})

auth.post('/switch-tenant', requireLogin, async c => {
  const { empresaId } = await c.req.json<any>()
  const s = c.get('session')
  if (!(await c.env.DB.prepare('SELECT 1 FROM members WHERE user_id = ? AND tenant_id = ? AND active = 1').bind(s.userId, empresaId).first())) throw fail(403, 'Você não faz parte desta empresa.')
  await endSession(c)
  await createSession(c, s.userId, empresaId)
  return c.json({ ok: true })
})

/* convite da equipe: o link traz o token; a pessoa cria a senha (ou entra, se já tiver conta) */
async function loadInvite(c: any) {
  const iv = await c.env.DB.prepare('SELECT i.*, t.name AS tenant_name FROM invites i JOIN tenants t ON t.id = i.tenant_id WHERE i.id = ?').bind(await sha256(c.req.param('token'))).first()
  if (!iv || iv.used_at || new Date(iv.expires_at) < new Date()) throw fail(404, 'Convite inválido ou expirado. Peça um novo ao gestor.')
  return iv
}
auth.get('/invite/:token', async c => {
  const iv = await loadInvite(c)
  const hasAccount = !!(await c.env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(iv.email).first())
  return c.json({ email: iv.email, empresa: iv.tenant_name, papel: iv.role, temConta: hasAccount })
})
auth.post('/invite/:token', async c => {
  const iv = await loadInvite(c), db = c.env.DB
  const b = await c.req.json<any>()
  // o convite pendente já ocupa a vaga; ao aceitar só conferimos se o plano não diminuiu
  if (iv.role === 'seller') {
    const t = await loadTenantPlano(db, iv.tenant_id)
    const n = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE tenant_id=? AND role='seller' AND active=1").bind(iv.tenant_id).first<{ n: number }>()
    if ((n?.n ?? 0) >= limiteVendedores(t)) throw fail(403, 'A empresa já usou todas as vagas de vendedor do plano. Peça ao administrador.')
  }
  let u = await db.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(iv.email).first<any>()
  if (u) {
    if (!(await checkPassword(String(b.senha ?? ''), u.password_hash))) throw fail(401, 'Senha incorreta para este e-mail.')
  } else {
    const name = clean(b.nome, 80), pw = String(b.senha ?? '')
    if (!name) throw fail(400, 'Informe seu nome.')
    if (pw.length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres.')
    u = { id: newId() }
    await db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?,?,?,?)').bind(u.id, iv.email, name, await hashPassword(pw)).run()
  }
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO members (tenant_id, user_id, role) VALUES (?,?,?)').bind(iv.tenant_id, u.id, iv.role),
    db.prepare("UPDATE invites SET used_at = datetime('now') WHERE id = ?").bind(iv.id),
  ])
  await createSession(c, u.id, iv.tenant_id)
  return c.json({ ok: true })
})
