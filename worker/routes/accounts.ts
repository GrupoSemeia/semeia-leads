import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail, newId, audit, digits, clean } from '../lib'
import { recomputeAccounts } from '../metrics'

export const accounts = new Hono<App>()

const PAGE = 30
const CURVAS = ['A', 'B', 'C'], STATUS = ['PROSPECT', 'ATIVO', 'EM_RISCO', 'INATIVO']

/** Vendedor só enxerga a própria carteira (owner_id = ele); gestor/admin enxergam tudo. */
const escopoVendedor = (c: any) => (c.get('session').role === 'seller' ? c.get('session').userId : null)

const COLS = `a.pessoa_rein_id AS id, p.name, p.legal_name AS legalName, p.cnpj, p.city, p.uf, p.whatsapp, a.curve, a.status, a.revenue_12m AS revenue12m, a.orders_12m AS orders12m,
  a.last_order_at AS lastOrderAt, a.last_contact_at AS lastContactAt, a.next_contact_due AS nextContactDue, a.priority_score AS priority, a.owner_id AS ownerId, u.name AS ownerName`
const FROM = `FROM accounts a JOIN rein_pessoas p ON p.tenant_id = a.tenant_id AND p.rein_id = a.pessoa_rein_id AND p.deleted_at IS NULL LEFT JOIN users u ON u.id = a.owner_id`

accounts.get('/', async c => {
  const t = tenantOf(c), q = c.req.query(), meu = escopoVendedor(c), db = c.env.DB
  const where = ['a.tenant_id = ?'], args: unknown[] = [t]
  if (meu) { where.push('a.owner_id = ?'); args.push(meu) }
  else if (q.dono === 'sem') where.push('a.owner_id IS NULL')
  else if (q.dono) { where.push('a.owner_id = ?'); args.push(q.dono) }
  const baseWhere = [...where], baseArgs = [...args]   // resumo por status usa só o escopo
  if (CURVAS.includes(q.curva)) { where.push('a.curve = ?'); args.push(q.curva) }
  if (q.curva === 'sem') where.push('a.curve IS NULL')
  if (STATUS.includes(q.status)) { where.push('a.status = ?'); args.push(q.status) }
  const busca = clean(q.q, 60).toLowerCase()
  if (busca) {
    const d = digits(busca), like = `%${busca.replace(/[%_]/g, '')}%`
    where.push(`(lower(p.name) LIKE ? OR lower(p.legal_name) LIKE ? OR lower(p.city) LIKE ?${d.length >= 3 ? ' OR p.cnpj LIKE ? OR p.whatsapp LIKE ?' : ''})`)
    args.push(like, like, like); if (d.length >= 3) args.push(`%${d}%`, `%${d}%`)
  }
  const page = Math.max(0, Math.floor(Number(q.page) || 0))
  const [rows, total, resumo] = await Promise.all([
    db.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY a.priority_score DESC, p.name LIMIT ${PAGE} OFFSET ?`).bind(...args, page * PAGE).all(),
    db.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${where.join(' AND ')}`).bind(...args).first<{ n: number }>(),
    db.prepare(`SELECT a.status, COUNT(*) AS n ${FROM} WHERE ${baseWhere.join(' AND ')} GROUP BY a.status`).bind(...baseArgs).all<any>(),
  ])
  const porStatus = Object.fromEntries(STATUS.map(s => [s, resumo.results.find((r: any) => r.status === s)?.n ?? 0]))
  return c.json({ itens: rows.results, total: total?.n ?? 0, pagina: page, tamanho: PAGE, porStatus })
})

/** Ficha do cliente. Nunca devolve custo nem margem. */
accounts.get('/:id{[0-9]+}', async c => {
  const t = tenantOf(c), id = Number(c.req.param('id')), meu = escopoVendedor(c), db = c.env.DB
  const conta = await db.prepare(
    `SELECT ${COLS}, a.avg_ticket AS avgTicket, a.avg_interval_days AS avgIntervalDays, a.priority_score AS priority,
            p.phone, p.email, p.cnae, p.credit_limit AS creditLimit, p.registered_at AS registeredAt, tp.name AS priceTable
       ${FROM} LEFT JOIN rein_tabelas_preco tp ON tp.tenant_id = p.tenant_id AND tp.rein_id = p.price_table_id
      WHERE a.tenant_id = ? AND a.pessoa_rein_id = ?${meu ? ' AND a.owner_id = ?' : ''}`).bind(...[t, id, ...(meu ? [meu] : [])]).first<any>()
  if (!conta) throw fail(404, 'Cliente não encontrado.')

  const [pedidos, top, comprados, categorias] = await Promise.all([
    db.prepare(`SELECT o.rein_id AS id, o.ordered_at AS orderedAt, o.total, o.cancelled, (SELECT COUNT(*) FROM rein_pedido_itens i WHERE i.tenant_id = o.tenant_id AND i.pedido_rein_id = o.rein_id) AS itens
                  FROM rein_pedidos o WHERE o.tenant_id = ? AND o.pessoa_rein_id = ? ORDER BY o.ordered_at DESC LIMIT 10`).bind(t, id).all(),
    db.prepare(`SELECT i.produto_rein_id AS id, COALESCE(pr.name, 'Produto ' || i.produto_rein_id) AS name, SUM(i.qty) AS qty, SUM(i.qty * i.unit_price) AS total
                  FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id = i.tenant_id AND o.rein_id = i.pedido_rein_id AND o.cancelled = 0
                  LEFT JOIN rein_produtos pr ON pr.tenant_id = i.tenant_id AND pr.rein_id = i.produto_rein_id
                 WHERE i.tenant_id = ? AND o.pessoa_rein_id = ? GROUP BY i.produto_rein_id ORDER BY total DESC LIMIT 5`).bind(t, id).all(),
    db.prepare(`SELECT DISTINCT pr.category_ids FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id = i.tenant_id AND o.rein_id = i.pedido_rein_id AND o.cancelled = 0
                  JOIN rein_produtos pr ON pr.tenant_id = i.tenant_id AND pr.rein_id = i.produto_rein_id WHERE i.tenant_id = ? AND o.pessoa_rein_id = ?`).bind(t, id).all<any>(),
    db.prepare('SELECT rein_id AS id, name FROM rein_categorias WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name').bind(t).all<any>(),
  ])
  const jaComprou = new Set(comprados.results.flatMap((r: any) => { try { return JSON.parse(r.category_ids) as number[] } catch { return [] } }))
  return c.json({ ...conta, pedidos: pedidos.results, topProdutos: top.results, categoriasNuncaCompradas: categorias.results.filter((k: any) => !jaComprou.has(k.id)) })
})

/* ---- ações do gestor ---- */
accounts.post('/recompute', requireRole('manager'), async c => c.json(await recomputeAccounts(c.env.DB, tenantOf(c))))

/** Passa clientes de vendedor (ou de "sem dono") para outro, com histórico. */
accounts.post('/reassign', requireRole('manager'), async c => {
  const t = tenantOf(c), db = c.env.DB, b = await c.req.json<any>()
  const ids: number[] = Array.isArray(b.ids) ? [...new Set<number>(b.ids.map(Number).filter((n: number) => Number.isInteger(n)))] : []
  if (!ids.length) throw fail(400, 'Escolha pelo menos um cliente.')
  if (ids.length > 500) throw fail(400, 'Mova até 500 clientes por vez.')
  const para: string | null = b.para ? String(b.para) : null
  if (para && !(await db.prepare('SELECT 1 FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(t, para).first())) throw fail(400, 'Essa pessoa não faz parte da equipe.')
  const marcas = ids.map(() => '?').join(',')
  const atuais = await db.prepare(`SELECT pessoa_rein_id AS id, owner_id FROM accounts WHERE tenant_id=? AND pessoa_rein_id IN (${marcas})`).bind(t, ...ids).all<any>()
  const mudam = atuais.results.filter((r: any) => (r.owner_id ?? null) !== para)
  const me = c.get('session').userId
  const stmts = mudam.flatMap((r: any) => [
    db.prepare('UPDATE accounts SET owner_id=? WHERE tenant_id=? AND pessoa_rein_id=?').bind(para, t, r.id),
    db.prepare('INSERT INTO ownership_history (id, tenant_id, pessoa_rein_id, from_user_id, to_user_id, by_user_id) VALUES (?,?,?,?,?,?)').bind(newId(), t, r.id, r.owner_id, para, me),
  ])
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  await audit(db, t, me, 'accounts.reassign', { qtd: mudam.length, para })
  return c.json({ movidos: mudam.length })
})
