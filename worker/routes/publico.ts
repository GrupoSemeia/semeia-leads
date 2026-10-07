import { Hono } from 'hono'
import { type App, fail, newId, clean } from '../lib'
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
  return c.json({ ok: true })
})
