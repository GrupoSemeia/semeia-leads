import { notificarGestores, linkApp } from '../notify'
import { avisoDetrator, avisoLeadSite } from '../domain/emails'
import { Hono } from 'hono'
import { type App, fail, newId, clean, loadTenantPlano } from '../lib'
import { nivelDe } from '../plans'
import { criarLead } from '../leads'
import { insatisfeito, notaValida } from '../domain/contato'

/** Rotas SEM login. Só o token (192 bits) dá acesso, e ele só mostra o nome da empresa e de quem está respondendo. */
export const publico = new Hono<App>()

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/
async function carregar(c: any) {
  const token = c.req.param('token')
  if (!TOKEN.test(token)) throw fail(404, 'Link inválido.')
  const r = await c.env.DB.prepare(`SELECT n.token, n.tenant_id, n.pessoa_rein_id, n.pedido_rein_id, n.answered_at, t.name AS empresa, p.name AS cliente
    FROM nps_responses n JOIN tenants t ON t.id = n.tenant_id LEFT JOIN rein_pessoas p ON p.tenant_id = n.tenant_id AND p.rein_id = n.pessoa_rein_id WHERE n.token = ?`).bind(token).first()
  if (!r) throw fail(404, 'Link inválido ou expirado.')
  return r
}

publico.get('/nps/:token', async c => { const r = await carregar(c); return c.json({ empresa: r.empresa, cliente: r.cliente, respondido: !!r.answered_at }) })

publico.post('/nps/:token', async c => {
  const r = await carregar(c), db = c.env.DB, b = await c.req.json<any>()
  if (r.answered_at) throw fail(409, 'Você já respondeu esta pesquisa. Obrigado!')
  if (!notaValida(b.nota)) throw fail(400, 'Escolha uma nota de 0 a 10.')
  const upd = await db.prepare("UPDATE nps_responses SET score=?, comment=?, answered_at=datetime('now') WHERE token=? AND answered_at IS NULL").bind(b.nota, clean(b.comentario, 500) || null, r.token).run()
  if (!upd.meta.changes) throw fail(409, 'Você já respondeu esta pesquisa. Obrigado!')
  const stmts = [db.prepare("UPDATE tasks SET status='FEITA', done_at=datetime('now') WHERE tenant_id=? AND type='NPS_D7' AND ref_id=? AND status='ABERTA'").bind(r.tenant_id, r.pedido_rein_id)]
  // nota ≤ 6: o dono da conta recebe "Tratar insatisfação" no topo da agenda (e o gestor vê na agenda de todos)
  if (insatisfeito(b.nota)) stmts.push(db.prepare("INSERT OR IGNORE INTO tasks (id, tenant_id, type, pessoa_rein_id, ref_id, due_at, reason, dedupe_key) VALUES (?,?, 'TRATAR_NPS', ?,?, datetime('now'), ?, ?)")
    .bind(newId(), r.tenant_id, r.pessoa_rein_id, r.pedido_rein_id, `Nota ${b.nota} na pesquisa de satisfação`, `TRATAR_NPS:pedido:${r.pedido_rein_id}`))
  await db.batch(stmts)
  if (insatisfeito(b.nota)) {
    const aviso = notificarGestores(c.env, r.tenant_id, { chave: `nps:${r.pedido_rein_id}`, msg: avisoDetrator({ cliente: r.cliente, nota: b.nota, comentario: clean(b.comentario, 300) || null, link: linkApp(c.env, '/hoje') }) })
    try { c.executionCtx.waitUntil(aviso) } catch { await aviso }
  }
  return c.json({ ok: true })
})

/* ---------- formulário "Seja revendedor" (sem login) ---------- */
const SLUG = /^[a-z0-9-]{1,60}$/
const LIMITE_TELEFONE_DIA = 3, LIMITE_EMPRESA_DIA = 200
/** Só empresas com funil de leads (Profissional ou acima, ou teste grátis) e conta ativa têm formulário. Resposta é igual para "não existe" e "indisponível". */
async function empresaDoFormulario(c: any) {
  const slug = c.req.param('slug')
  const t = SLUG.test(slug) ? await c.env.DB.prepare('SELECT id, name, plan, tier, trial_until, extra_sellers FROM tenants WHERE slug = ?').bind(slug).first() : null
  if (!t || t.plan === 'suspenso' || nivelDe(t) < 2) throw fail(404, 'Formulário indisponível.')
  return t as any
}
publico.get('/revendedor/:slug', async c => { const t = await empresaDoFormulario(c); return c.json({ empresa: t.name }) })

publico.post('/revendedor/:slug', async c => {
  const t = await empresaDoFormulario(c), b = await c.req.json<any>(), db = c.env.DB
  if (clean(b.site, 50)) return c.json({ ok: true })   // campo-isca: robô preenche, gente não vê
  const tel = String(b.whatsapp ?? '').replace(/\D/g, '')
  const [porTel, porEmpresa] = await Promise.all([
    tel ? db.prepare("SELECT COUNT(*) AS n FROM leads WHERE tenant_id=? AND source='site' AND whatsapp=? AND created_at >= datetime('now','-1 day')").bind(t.id, tel).first<{ n: number }>() : null,
    db.prepare("SELECT COUNT(*) AS n FROM leads WHERE tenant_id=? AND source='site' AND created_at >= datetime('now','-1 day')").bind(t.id).first<{ n: number }>(),
  ])
  if ((porTel?.n ?? 0) >= LIMITE_TELEFONE_DIA || (porEmpresa?.n ?? 0) >= LIMITE_EMPRESA_DIA) throw fail(429, 'Recebemos muitos pedidos deste contato hoje. Tente amanhã ou fale direto com a empresa.')
  const lead = await criarLead(c.env, t.id, { cnpj: b.cnpj, razaoSocial: b.razaoSocial, contato: b.contato, whatsapp: b.whatsapp, cidade: b.cidade, uf: b.uf, segmento: b.segmento }, { criadoPor: null, publico: true })
  if (!lead.duplicado && lead.id) {
    const aviso = notificarGestores(c.env, t.id, { chave: `lead:${lead.id}`, limitePorHora: 10, msg: avisoLeadSite({ empresa: clean(b.razaoSocial, 80) || 'Empresa nova', contato: clean(b.contato, 80), cidade: clean(b.cidade, 60) || null, link: linkApp(c.env, '/leads') }) })
    try { c.executionCtx.waitUntil(aviso) } catch { await aviso }
  }
  return c.json({ ok: true })   // mesma resposta para lead novo, repetido ou CNPJ que já é cliente: nada vaza sobre a carteira da empresa
})
