import { Hono } from 'hono'
import { type App, tenantOf, requireRole, requireNivel, fail, newId, audit, digits, clean } from '../lib'
import { recomputeAccounts, rescoreAccount } from '../metrics'
import { trocarDonoContas, processarVendedorErp, carregarConfigPessoa } from '../carteira-erp'
import { efeitoDoContato, concluiTarefa, RESULTADOS, CANAIS, renderModelo, MODELOS_PADRAO, type Resultado } from '../domain/contato'
import { ensureTemplates } from '../tasks'

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

  const [pedidos, top, comprados, categorias, interacoes] = await Promise.all([
    db.prepare(`SELECT o.rein_id AS id, o.ordered_at AS orderedAt, o.total, o.cancelled, (SELECT COUNT(*) FROM rein_pedido_itens i WHERE i.tenant_id = o.tenant_id AND i.pedido_rein_id = o.rein_id) AS itens
                  FROM rein_pedidos o WHERE o.tenant_id = ? AND o.pessoa_rein_id = ? ORDER BY o.ordered_at DESC LIMIT 10`).bind(t, id).all(),
    db.prepare(`SELECT i.produto_rein_id AS id, COALESCE(pr.name, 'Produto ' || i.produto_rein_id) AS name, SUM(i.qty) AS qty, SUM(i.qty * i.unit_price) AS total
                  FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id = i.tenant_id AND o.rein_id = i.pedido_rein_id AND o.cancelled = 0
                  LEFT JOIN rein_produtos pr ON pr.tenant_id = i.tenant_id AND pr.rein_id = i.produto_rein_id
                 WHERE i.tenant_id = ? AND o.pessoa_rein_id = ? GROUP BY i.produto_rein_id ORDER BY total DESC LIMIT 5`).bind(t, id).all(),
    db.prepare(`SELECT DISTINCT pr.category_ids FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id = i.tenant_id AND o.rein_id = i.pedido_rein_id AND o.cancelled = 0
                  JOIN rein_produtos pr ON pr.tenant_id = i.tenant_id AND pr.rein_id = i.produto_rein_id WHERE i.tenant_id = ? AND o.pessoa_rein_id = ?`).bind(t, id).all<any>(),
    db.prepare('SELECT rein_id AS id, name FROM rein_categorias WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY name').bind(t).all<any>(),
    db.prepare(`SELECT i.id, i.channel, i.result, i.note, i.next_contact_at AS nextContactAt, i.created_at AS createdAt, u.name AS userName
                  FROM interactions i JOIN users u ON u.id = i.user_id WHERE i.tenant_id = ? AND i.pessoa_rein_id = ? ORDER BY i.created_at DESC LIMIT 20`).bind(t, id).all(),
  ])
  const jaComprou = new Set(comprados.results.flatMap((r: any) => { try { return JSON.parse(r.category_ids) as number[] } catch { return [] } }))
  return c.json({ ...conta, pedidos: pedidos.results, topProdutos: top.results, categoriasNuncaCompradas: categorias.results.filter((k: any) => !jaComprou.has(k.id)), interacoes: interacoes.results })
})

/* ---- ações do gestor ---- */
accounts.post('/recompute', requireRole('manager'), async c => c.json(await recomputeAccounts(c.env.DB, tenantOf(c))))

/**
 * Passa clientes de vendedor (ou de "sem dono") para outro. SÓ O ADMINISTRADOR da empresa troca carteira (decisão do Augusto/Neto).
 * A troca entra na fila de atualização do ERP e leva junto os leads abertos do cliente.
 */
accounts.post('/reassign', requireRole(), async c => {
  const t = tenantOf(c), db = c.env.DB, b = await c.req.json<any>()
  const ids: number[] = Array.isArray(b.ids) ? [...new Set<number>(b.ids.map(Number).filter((n: number) => Number.isInteger(n)))] : []
  if (!ids.length) throw fail(400, 'Escolha pelo menos um cliente.')
  if (ids.length > 500) throw fail(400, 'Mova até 500 clientes por vez.')
  const para: string | null = b.para ? String(b.para) : null
  if (para && !(await db.prepare('SELECT 1 FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(t, para).first())) throw fail(400, 'Essa pessoa não faz parte da equipe.')
  const me = c.get('session').userId
  const movidos = await trocarDonoContas(db, t, ids, para, me)
  await audit(db, t, me, 'accounts.reassign', { qtd: movidos, para })
  return c.json({ movidos })
})

const MAX_MASSA = 2000
/**
 * Redistribuição em massa por filtro (vendedor de origem, curva, status). Só o administrador, plano Distribuidor.
 * Sem `confirmar` devolve só a prévia (quantos e quem); com `confirmar: true` move, com histórico e fila do ERP como na troca individual.
 */
accounts.post('/reassign-filtro', requireRole(), requireNivel(3), async c => {
  const t = tenantOf(c), db = c.env.DB, b = await c.req.json<any>(), me = c.get('session').userId
  const para: string | null = b.para ? String(b.para) : null
  if (para && !(await db.prepare('SELECT 1 FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(t, para).first())) throw fail(400, 'Essa pessoa não faz parte da equipe.')
  if (!para && b.confirmar) throw fail(400, 'Escolha para quem passar os clientes.')
  const where = ['a.tenant_id = ?'], args: unknown[] = [t]
  if (b.de === 'sem') where.push('a.owner_id IS NULL')
  else if (b.de) { where.push('a.owner_id = ?'); args.push(String(b.de)) }
  else throw fail(400, 'Escolha de qual vendedor (ou “sem dono”) sairão os clientes.')
  if (CURVAS.includes(b.curva)) { where.push('a.curve = ?'); args.push(b.curva) } else if (b.curva === 'sem') where.push('a.curve IS NULL')
  if (STATUS.includes(b.status)) { where.push('a.status = ?'); args.push(b.status) }
  if (para) { where.push('(a.owner_id IS NULL OR a.owner_id <> ?)'); args.push(para) }
  const rows = await db.prepare(`SELECT a.pessoa_rein_id AS id, p.name FROM accounts a JOIN rein_pessoas p ON p.tenant_id=a.tenant_id AND p.rein_id=a.pessoa_rein_id AND p.deleted_at IS NULL
                                  WHERE ${where.join(' AND ')} ORDER BY a.priority_score DESC LIMIT ${MAX_MASSA + 1}`).bind(...args).all<any>()
  if (rows.results.length > MAX_MASSA) throw fail(400, `O filtro pegou mais de ${MAX_MASSA} clientes. Restrinja por curva ou status.`)
  if (!b.confirmar) return c.json({ total: rows.results.length, amostra: rows.results.slice(0, 5).map((r: any) => r.name) })
  let movidos = 0
  const ids = rows.results.map((r: any) => r.id as number)
  for (let i = 0; i < ids.length; i += 200) movidos += await trocarDonoContas(db, t, ids.slice(i, i + 200), para, me)
  await audit(db, t, me, 'accounts.reassign_filtro', { qtd: movidos, de: b.de, curva: b.curva ?? null, status: b.status ?? null, para })
  return c.json({ movidos })
})

/* ---- trocas de vendedor que ainda precisam chegar ao ERP ---- */
accounts.get('/erp-pendencias', requireRole('manager'), async c => {
  const t = tenantOf(c), db = c.env.DB
  const [itens, resumo, cfg, ligada] = await Promise.all([
    db.prepare(`SELECT s.id, s.pessoa_rein_id AS pessoaId, p.name AS cliente, u.name AS para, s.status, s.error AS erro, s.attempts, s.created_at AS criadoEm
                  FROM owner_erp_sync s LEFT JOIN rein_pessoas p ON p.tenant_id = s.tenant_id AND p.rein_id = s.pessoa_rein_id JOIN users u ON u.id = s.to_user_id
                 WHERE s.tenant_id = ? AND (s.status <> 'ENVIADO' OR s.updated_at >= datetime('now','-7 days')) ORDER BY s.created_at DESC LIMIT 100`).bind(t).all(),
    db.prepare("SELECT status, COUNT(*) AS n FROM owner_erp_sync WHERE tenant_id=? GROUP BY status").bind(t).all<any>(),
    carregarConfigPessoa(db, t),
    db.prepare('SELECT pessoa_write_enabled AS e FROM tenant_rein WHERE tenant_id=?').bind(t).first<{ e: number }>(),
  ])
  const n = (s: string) => resumo.results.find((x: any) => x.status === s)?.n ?? 0
  return c.json({ itens: itens.results, pendentes: n('PENDENTE') + n('ENVIANDO'), erros: n('ERRO'), campoConfigurado: !!cfg.campoVendedor, escritaLigada: !!ligada?.e })
})
/** Envia agora as trocas pendentes (uma fatia por chamada; o navegador repete até acabar). */
accounts.post('/erp-pendencias/processar', requireRole(), async c => c.json(await processarVendedorErp(c.env, tenantOf(c))))
/** O admin confere no ERP uma troca que deu erro: marca como enviada (o vendedor já mudou lá) ou manda tentar de novo. */
accounts.post('/erp-pendencias/:id/resolver', requireRole(), async c => {
  const t = tenantOf(c), b = await c.req.json<any>(), id = c.req.param('id')
  const novo = b.resultado === 'ENVIADO' ? 'ENVIADO' : b.resultado === 'PENDENTE' ? 'PENDENTE' : null
  if (!novo) throw fail(400, 'Escolha “ENVIADO” ou “PENDENTE”.')
  const r = await c.env.DB.prepare("UPDATE owner_erp_sync SET status=?, error=NULL, attempts=0, updated_at=datetime('now') WHERE id=? AND tenant_id=? AND status IN ('ERRO','ENVIANDO')").bind(novo, id, t).run()
  if (!r.meta.changes) throw fail(409, 'Só dá para resolver troca com erro ou travada.')
  await audit(c.env.DB, t, c.get('session').userId, 'carteira.erp_resolvido', { id, novo })
  return c.json({ ok: true })
})

/* ---- contato com o cliente ---- */
/** Conta que o usuário pode trabalhar: vendedor só a própria; gestor/admin qualquer da empresa. */
async function contaAcessivel(c: any, id: number) {
  const meu = escopoVendedor(c)
  const a = await c.env.DB.prepare(`SELECT a.pessoa_rein_id AS id, p.name, p.whatsapp FROM accounts a JOIN rein_pessoas p ON p.tenant_id=a.tenant_id AND p.rein_id=a.pessoa_rein_id
    WHERE a.tenant_id = ? AND a.pessoa_rein_id = ?${meu ? ' AND a.owner_id = ?' : ''}`).bind(...[tenantOf(c), id, ...(meu ? [meu] : [])]).first()
  if (!a) throw fail(404, 'Cliente não encontrado.')
  return a as { id: number; name: string; whatsapp: string | null }
}

/** Registrar contato feito: grava no histórico, define o próximo contato pelo resultado e conclui a tarefa. */
accounts.post('/:id{[0-9]+}/interactions', async c => {
  const t = tenantOf(c), id = Number(c.req.param('id')), db = c.env.DB, b = await c.req.json<any>(), me = c.get('session').userId, agora = new Date()
  await contaAcessivel(c, id)
  const canal = CANAIS.includes(b.canal) ? b.canal : 'whatsapp'
  const resultado: Resultado | null = RESULTADOS.includes(b.resultado) ? b.resultado : null
  if (!resultado) throw fail(400, 'Escolha o resultado do contato.')
  const efeito = efeitoDoContato(resultado, agora, b.reagendarPara ? new Date(`${String(b.reagendarPara).slice(0, 10)}T12:00:00Z`) : null)
  if (!efeito.ok) throw fail(400, efeito.erro)
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)
  const stmts = [
    db.prepare('INSERT INTO interactions (id, tenant_id, pessoa_rein_id, user_id, channel, result, note, next_contact_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(newId(), t, id, me, canal, resultado, clean(b.nota, 500) || null, fmt(efeito.reagendarPara)),
    db.prepare('UPDATE accounts SET last_contact_at=?, reschedule_at=? WHERE tenant_id=? AND pessoa_rein_id=?').bind(fmt(agora), fmt(efeito.reagendarPara), t, id),
  ]
  if (concluiTarefa(resultado)) {
    // a tarefa escolhida na agenda e o pós-venda D+1 do cliente deixam de pendurar; "não respondeu" mantém tudo aberto
    stmts.push(db.prepare(`UPDATE tasks SET status='FEITA', done_at=datetime('now') WHERE tenant_id=? AND pessoa_rein_id=? AND status='ABERTA' AND (id = ? OR type = 'POS_VENDA_D1')`).bind(t, id, String(b.tarefaId ?? '')))
  } else if (b.tarefaId) {
    stmts.push(db.prepare(`UPDATE tasks SET due_at=? WHERE tenant_id=? AND id=? AND pessoa_rein_id=? AND status='ABERTA'`).bind(fmt(efeito.reagendarPara), t, String(b.tarefaId), id))
  }
  await db.batch(stmts)
  await rescoreAccount(db, t, id, agora)
  return c.json({ ok: true, proximoContato: fmt(efeito.reagendarPara) })
})

/** Clique no botão de WhatsApp: fica no histórico, mas não conta como contato feito (o vendedor ainda precisa registrar o resultado). */
accounts.post('/:id{[0-9]+}/whatsapp-click', async c => {
  const id = Number(c.req.param('id'))
  await contaAcessivel(c, id)
  await c.env.DB.prepare("INSERT INTO interactions (id, tenant_id, pessoa_rein_id, user_id, channel, note) VALUES (?,?,?,?, 'whatsapp', 'Abriu o WhatsApp')").bind(newId(), tenantOf(c), id, c.get('session').userId).run()
  return c.json({ ok: true })
})

/** Mensagem pronta para o cliente a partir de um modelo da empresa. */
accounts.get('/:id{[0-9]+}/mensagem', async c => {
  const t = tenantOf(c), id = Number(c.req.param('id')), db = c.env.DB
  const conta = await contaAcessivel(c, id)
  const key = c.req.query('modelo') ?? 'oferta'
  const [modelos, empresa, top] = await Promise.all([
    ensureTemplates(db, t),
    db.prepare('SELECT name FROM tenants WHERE id=?').bind(t).first<{ name: string }>(),
    db.prepare(`SELECT pr.name FROM rein_pedido_itens i JOIN rein_pedidos o ON o.tenant_id=i.tenant_id AND o.rein_id=i.pedido_rein_id AND o.cancelled=0
                  JOIN rein_produtos pr ON pr.tenant_id=i.tenant_id AND pr.rein_id=i.produto_rein_id WHERE i.tenant_id=? AND o.pessoa_rein_id=? GROUP BY pr.rein_id ORDER BY SUM(i.qty) DESC LIMIT 1`).bind(t, id).first<{ name: string }>(),
  ])
  const corpo = modelos.find(m => m.key === key)?.body ?? MODELOS_PADRAO.find(m => m.key === key)?.body
  if (!corpo) throw fail(404, 'Modelo desconhecido.')
  return c.json({ texto: renderModelo(corpo, { contato: conta.name, vendedor: c.get('session').name, empresa: empresa?.name, produto: top?.name, link: '' }), whatsapp: conta.whatsapp })
})
