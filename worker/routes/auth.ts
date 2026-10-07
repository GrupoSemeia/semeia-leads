import { Hono } from 'hono'
import { emailRecuperacaoSenha, emailValido } from '../domain/emails'
import { enviarEmail } from '../email'
import { type App, loadTenantPlano, newId, hashPassword, checkPassword, createSession, endSession, readSession, clean, slugify, fail, sha256, requireLogin, randomToken, audit } from '../lib'

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

/* recuperação de senha: resposta sempre igual (não revela se o e-mail existe); token de 1 h, só o hash fica no banco */
const VALIDADE_RESET_MIN = 60
auth.post('/esqueci', async c => {
  const b = await c.req.json<any>().catch(() => ({}))
  const email = clean(b.email, 120).toLowerCase()
  const resposta = { ok: true, mensagem: 'Se este e-mail tiver conta, enviamos um link para criar uma nova senha. Ele vale por 1 hora.' }
  if (!emailValido(email)) return c.json(resposta)
  const db = c.env.DB
  const ip = c.req.header('cf-connecting-ip') ?? 'sem-ip'
  const ipHash = await sha256(`ip:${ip}`)
  const lim = await db.prepare("SELECT (SELECT COUNT(*) FROM password_resets WHERE ip_hash = ?1 AND created_at > datetime('now','-1 hour')) AS ip").bind(ipHash).first<{ ip: number }>()
  if ((lim?.ip ?? 0) >= 10) return c.json(resposta)
  const u = await db.prepare('SELECT id, name FROM users WHERE email = ?').bind(email).first<any>()
  if (!u) return c.json(resposta)
  const n = await db.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > datetime('now','-1 hour')").bind(u.id).first<{ n: number }>()
  if ((n?.n ?? 0) >= 3) return c.json(resposta)
  const token = randomToken(32)
  await db.batch([
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(u.id),
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, ip_hash) VALUES (?,?,?,?)')
      .bind(await sha256(token), u.id, new Date(Date.now() + VALIDADE_RESET_MIN * 60000).toISOString(), ipHash),
  ])
  const base = (c.env.APP_URL || new URL(c.req.url).origin).replace(/\/+$/, '')
  const msg = emailRecuperacaoSenha({ nome: u.name, link: `${base}/redefinir/${token}`, validadeMin: VALIDADE_RESET_MIN })
  const envio = enviarEmail(c.env, email, msg).then(r => { if (!r.ok) console.warn('reset de senha: e-mail não enviado', r.motivo) })
  try { c.executionCtx.waitUntil(envio) } catch { await envio }
  return c.json(resposta)
})

async function carregarReset(c: any) {
  const r = await c.env.DB.prepare('SELECT token_hash, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?')
    .bind(await sha256(c.req.param('token')), new Date().toISOString()).first()
  if (!r) throw fail(404, 'Este link venceu ou já foi usado. Peça um novo em "Esqueci a senha".')
  return r
}
auth.get('/redefinir/:token', async c => {
  const r = await carregarReset(c)
  const u = await c.env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(r.user_id).first<any>()
  return c.json({ email: u?.email ?? '' })
})
auth.post('/redefinir/:token', async c => {
  const r = await carregarReset(c), db = c.env.DB
  const b = await c.req.json<any>().catch(() => ({}))
  const pw = String(b.senha ?? '')
  if (pw.length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres.')
  // consumo atômico: só quem marcar o token como usado troca a senha
  const uso = await db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(r.token_hash, new Date().toISOString()).run()
  if (!uso.meta.changes) throw fail(404, 'Este link venceu ou já foi usado. Peça um novo em "Esqueci a senha".')
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(pw), r.user_id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.user_id),
    db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(r.user_id),
  ])
  const m = await db.prepare('SELECT tenant_id FROM members WHERE user_id = ? AND active = 1 ORDER BY created_at LIMIT 1').bind(r.user_id).first<any>()
  if (m) await audit(db, m.tenant_id, r.user_id, 'senha_redefinida')
  return c.json({ ok: true })
})
