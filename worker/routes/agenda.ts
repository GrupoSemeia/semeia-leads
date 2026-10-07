import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail, clean } from '../lib'
import { loadParams } from '../metrics'
import { agendaCompleta, renderModelo, MODELOS_PADRAO, CHAVES_MODELO, type TarefaAberta } from '../domain/contato'
import type { ContaAgenda, Curve, AccountStatus } from '../domain/carteira'
import { ensureTemplates } from '../tasks'

export const agenda = new Hono<App>()
const utc = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null)
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

type LinhaConta = { id: number; curve: Curve | null; status: AccountStatus; orders_12m: number; last_order_at: string | null; avg_interval_days: number | null; next_contact_due: string | null; last_contact_at: string | null; priority_score: number }
export const paraConta = (r: LinhaConta, agora: Date): ContaAgenda => ({
  id: r.id, curva: r.curve, status: r.status, pedidos12m: r.orders_12m, ultimoPedido: utc(r.last_order_at), intervaloMedioDias: r.avg_interval_days,
  proximoContato: utc(r.next_contact_due) ?? agora, ultimoContato: utc(r.last_contact_at), score: r.priority_score,
})
const COLS_CONTA = 'a.pessoa_rein_id AS id, a.curve, a.status, a.orders_12m, a.last_order_at, a.avg_interval_days, a.next_contact_due, a.last_contact_at, a.priority_score'

/**
 * Agenda do dia. Vendedor: só a própria carteira. Gestor/admin: a própria por padrão; `?escopo=todos` mostra todos os vendedores.
 * Já devolve a mensagem de WhatsApp pronta (modelo certo para o motivo, com as variáveis preenchidas).
 */
agenda.get('/', async c => {
  const t = tenantOf(c), db = c.env.DB, s = c.get('session'), agora = new Date()
  const todos = s.role !== 'seller' && c.req.query('escopo') === 'todos'
  const donoSql = todos ? '' : ' AND a.owner_id = ?', donoArg = todos ? [] : [s.userId]
  const p = await loadParams(db, t)

  const [devidas, tarefasRows, empresa, modelos] = await Promise.all([
    db.prepare(`SELECT ${COLS_CONTA} FROM accounts a JOIN rein_pessoas pe ON pe.tenant_id=a.tenant_id AND pe.rein_id=a.pessoa_rein_id AND pe.deleted_at IS NULL
                 WHERE a.tenant_id = ? AND a.next_contact_due <= ?${donoSql} ORDER BY a.priority_score DESC LIMIT 200`).bind(t, fmt(agora), ...donoArg).all<LinhaConta>(),
    db.prepare(`SELECT k.id AS tid, k.type, k.due_at, k.ref_id, n.score AS nota, ${COLS_CONTA}
                  FROM tasks k JOIN accounts a ON a.tenant_id = k.tenant_id AND a.pessoa_rein_id = k.pessoa_rein_id
                  JOIN rein_pessoas pe ON pe.tenant_id=a.tenant_id AND pe.rein_id=a.pessoa_rein_id AND pe.deleted_at IS NULL
                  LEFT JOIN nps_responses n ON n.tenant_id = k.tenant_id AND n.pedido_rein_id = k.ref_id
                 WHERE k.tenant_id = ? AND k.status = 'ABERTA' AND k.due_at <= ?${donoSql}`).bind(t, fmt(agora), ...donoArg).all<any>(),
    db.prepare('SELECT name FROM tenants WHERE id=?').bind(t).first<{ name: string }>(),
    ensureTemplates(db, t),
  ])
  const tarefas: TarefaAberta[] = tarefasRows.results.map((r: any) => ({ id: r.tid, tipo: r.type, venceEm: utc(r.due_at)!, nota: r.nota, conta: paraConta(r, agora) }))
  const itens = agendaCompleta(devidas.results.map(r => paraConta(r, agora)), tarefas, agora, p)
  const totalDevido = new Set([...devidas.results.map(r => r.id), ...tarefas.map(x => x.conta.id)]).size

  const ids = itens.map(i => i.id)
  const marcas = ids.map(() => '?').join(',')
  const [pessoas, produtos, nps] = ids.length ? await Promise.all([
    db.prepare(`SELECT rein_id AS id, name, whatsapp FROM rein_pessoas WHERE tenant_id=? AND rein_id IN (${marcas})`).bind(t, ...ids).all<any>(),
    db.prepare(`SELECT pessoa, name FROM (SELECT o.pessoa_rein_id AS pessoa, pr.name AS name, ROW_NUMBER() OVER (PARTITION BY o.pessoa_rein_id ORDER BY SUM(i.qty) DESC) AS rn
                  FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id=i.tenant_id AND o.rein_id=i.pedido_rein_id AND o.cancelled=0
                  JOIN rein_produtos pr ON pr.tenant_id=i.tenant_id AND pr.rein_id=i.produto_rein_id
                 WHERE i.tenant_id=? AND o.pessoa_rein_id IN (${marcas}) GROUP BY o.pessoa_rein_id, pr.rein_id) WHERE rn=1`).bind(t, ...ids).all<any>(),
    db.prepare(`SELECT n.token, k.id AS tid FROM tasks k JOIN nps_responses n ON n.tenant_id=k.tenant_id AND n.pedido_rein_id=k.ref_id WHERE k.tenant_id=? AND k.type='NPS_D7' AND k.status='ABERTA'`).bind(t).all<any>(),
  ]) : [{ results: [] }, { results: [] }, { results: [] }] as any
  const pessoa = new Map<number, any>(pessoas.results.map((r: any) => [r.id, r]))
  const produto = new Map<number, string>(produtos.results.map((r: any) => [r.pessoa, r.name]))
  const link = new Map<string, string>(nps.results.map((r: any) => [r.tid, r.token]))
  const modelo = new Map(modelos.map(m => [m.key, m.body]))
  const origem = new URL(c.req.url).origin

  return c.json({
    total: totalDevido, mostrando: itens.length,
    itens: itens.map(i => {
      const pe = pessoa.get(i.id)
      const token = i.tarefa ? link.get(i.tarefa.id) : undefined
      const corpo = modelo.get(i.modelo) ?? MODELOS_PADRAO.find(m => m.key === i.modelo)?.body ?? ''
      return { ...i, nome: pe?.name ?? `Cliente ${i.id}`, whatsapp: pe?.whatsapp ?? null,
        mensagem: renderModelo(corpo, { contato: pe?.name, vendedor: s.name, empresa: empresa?.name, produto: produto.get(i.id), link: token ? `${origem}/nps/${token}` : '' }) }
    }),
  })
})

/* ---- modelos de mensagem ---- */
export const templates = new Hono<App>()
templates.get('/', async c => c.json({ itens: await ensureTemplates(c.env.DB, tenantOf(c)) }))
templates.put('/:key', requireRole('manager'), async c => {
  const key = c.req.param('key'), b = await c.req.json<any>()
  if (!CHAVES_MODELO.includes(key)) throw fail(404, 'Modelo desconhecido.')
  const title = clean(b.title, 80), body = clean(b.body, 1000)
  if (!title || !body) throw fail(400, 'Preencha o título e o texto do modelo.')
  await ensureTemplates(c.env.DB, tenantOf(c))
  await c.env.DB.prepare('UPDATE message_templates SET title=?, body=? WHERE tenant_id=? AND key=?').bind(title, body, tenantOf(c), key).run()
  return c.json({ ok: true })
})
