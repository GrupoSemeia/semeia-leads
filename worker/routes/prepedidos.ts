import { Hono } from 'hono'
import { type App, type C, tenantOf, fail, newId, clean, audit, requireRole } from '../lib'
import { tabelaDoCliente } from './catalogo'
import { validarPedido, totalDe, montarResumo, montarCorpoPedido, mesclarConfig, faltaConfigurar, type Linha } from '../domain/pedido'
import { loadReinCreds } from './rein'
import { reinApiFor } from '../rein/api'

export const prepedidos = new Hono<App>()
const hojeLocal = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const EDITAVEL = ['RASCUNHO', 'PENDENTE_FLAG', 'ERRO']

/** Pré-pedido da empresa que o usuário pode mexer: vendedor só os que ele montou; gestor/admin todos. */
async function carregar(c: C, id: string) {
  const s = c.get('session'), meu = s.role === 'seller'
  const r = await c.env.DB.prepare(`SELECT * FROM pre_orders WHERE id = ? AND tenant_id = ?${meu ? ' AND user_id = ?' : ''}`).bind(...[id, tenantOf(c), ...(meu ? [s.userId] : [])]).first<any>()
  if (!r) throw fail(404, 'Pré-pedido não encontrado.')
  return r
}
async function linhasDe(db: D1Database, t: string, id: string): Promise<Linha[]> {
  const r = await db.prepare('SELECT produto_rein_id AS produtoId, name AS nome, code AS codigo, qty AS qtd, unit_price AS preco FROM pre_order_items WHERE pre_order_id=? AND tenant_id=? ORDER BY line').bind(id, t).all<Linha>()
  return r.results
}

/** Busca no servidor o preço de cada produto na tabela do cliente. O preço enviado pelo navegador nunca é usado. */
async function precificar(db: D1Database, t: string, tabelaId: number | null, tabelaNome: string | null, itens: { produtoId: number; qtd: number }[]): Promise<Linha[]> {
  if (tabelaId === null) throw fail(400, 'Este cliente não tem tabela de preço no ERP. Peça ao gestor para ajustar o cadastro.')
  const marcas = itens.map(() => '?').join(',')
  const r = await db.prepare(
    `SELECT p.rein_id AS id, p.name, p.code, p.active, pr.price FROM rein_produtos p
       LEFT JOIN rein_precos pr ON pr.tenant_id = p.tenant_id AND pr.produto_rein_id = p.rein_id AND pr.tabela_rein_id = ?
      WHERE p.tenant_id = ? AND p.deleted_at IS NULL AND p.rein_id IN (${marcas})`).bind(tabelaId, t, ...itens.map(i => i.produtoId)).all<any>()
  const por = new Map<number, any>(r.results.map((x: any) => [x.id, x]))
  return itens.map(i => {
    const p = por.get(i.produtoId)
    if (!p || !p.active) throw fail(400, 'Um dos produtos não está mais disponível. Atualize o catálogo.')
    if (p.price === null || p.price === undefined) throw fail(400, `“${p.name}” não tem preço na tabela ${tabelaNome ?? 'do cliente'}.`)
    return { produtoId: p.id, nome: p.name, codigo: p.code, qtd: i.qtd, preco: p.price }
  })
}
const gravarItens = (db: D1Database, t: string, id: string, linhas: Linha[]) => [
  db.prepare('DELETE FROM pre_order_items WHERE pre_order_id=? AND tenant_id=?').bind(id, t),
  ...linhas.map((l, i) => db.prepare('INSERT INTO pre_order_items (pre_order_id, tenant_id, line, produto_rein_id, name, code, qty, unit_price) VALUES (?,?,?,?,?,?,?,?)').bind(id, t, i, l.produtoId, l.nome, l.codigo, l.qtd, l.preco)),
]

prepedidos.post('/', async c => {
  const t = tenantOf(c), db = c.env.DB, b = await c.req.json<any>(), me = c.get('session').userId
  const cli = await tabelaDoCliente(c, Number(b.clienteId))
  const v = validarPedido(b.itens); if (!v.ok) throw fail(400, v.erro)
  const linhas = await precificar(db, t, cli.tabelaId, cli.tabelaNome, v.itens), id = newId()
  await db.batch([
    db.prepare('INSERT INTO pre_orders (id, tenant_id, pessoa_rein_id, user_id, tabela_rein_id, total, note) VALUES (?,?,?,?,?,?,?)').bind(id, t, cli.id, me, cli.tabelaId, totalDe(linhas), clean(b.observacao, 500) || null),
    ...gravarItens(db, t, id, linhas),
  ])
  return c.json({ id, total: totalDe(linhas) })
})

prepedidos.get('/', async c => {
  const s = c.get('session'), meu = s.role === 'seller', status = c.req.query('status')
  const where = ['o.tenant_id = ?'], args: unknown[] = [tenantOf(c)]
  if (meu) { where.push('o.user_id = ?'); args.push(s.userId) }
  if (status && /^[A-Z_]+$/.test(status)) { where.push('o.status = ?'); args.push(status) }
  const r = await c.env.DB.prepare(
    `SELECT o.id, o.status, o.total, o.created_at AS createdAt, o.pedido_rein_id AS pedidoReinId, p.name AS cliente, u.name AS vendedor
       FROM pre_orders o LEFT JOIN rein_pessoas p ON p.tenant_id = o.tenant_id AND p.rein_id = o.pessoa_rein_id JOIN users u ON u.id = o.user_id
      WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC LIMIT 100`).bind(...args).all()
  return c.json({ itens: r.results })
})

prepedidos.get('/:id', async c => {
  const t = tenantOf(c), db = c.env.DB, o = await carregar(c, c.req.param('id'))
  const [linhas, pessoa, empresa, vend, cfg, creds] = await Promise.all([
    linhasDe(db, t, o.id),
    db.prepare('SELECT name, whatsapp FROM rein_pessoas WHERE tenant_id=? AND rein_id=?').bind(t, o.pessoa_rein_id).first<any>(),
    db.prepare('SELECT name FROM tenants WHERE id=?').bind(t).first<{ name: string }>(),
    db.prepare('SELECT u.name, m.rein_user_id FROM users u JOIN members m ON m.user_id=u.id AND m.tenant_id=? WHERE u.id=?').bind(t, o.user_id).first<any>(),
    carregarConfig(db, t), loadReinCreds(c.env, t).catch(() => null),
  ])
  const ativo = await escritaLigada(db, t)
  return c.json({
    id: o.id, status: o.status, total: o.total, observacao: o.note, erro: o.error, pedidoReinId: o.pedido_rein_id, criadoEm: o.created_at, linhas,
    cliente: { id: o.pessoa_rein_id, nome: pessoa?.name ?? `Cliente ${o.pessoa_rein_id}`, whatsapp: pessoa?.whatsapp ?? null }, vendedor: vend?.name,
    resumo: montarResumo({ empresa: empresa?.name ?? '', cliente: pessoa?.name ?? '', vendedor: vend?.name ?? '', linhas, observacao: o.note }),
    envioErp: { ligado: ativo, modoTeste: !!creds?.mock, falta: ativo ? faltaConfigurar(cfg, vend?.rein_user_id ?? null) : [] },
  })
})

prepedidos.put('/:id', async c => {
  const t = tenantOf(c), db = c.env.DB, o = await carregar(c, c.req.param('id')), b = await c.req.json<any>()
  if (!EDITAVEL.includes(o.status)) throw fail(409, o.status === 'ENVIADO' ? 'Este pedido já foi enviado ao ERP e não pode mais ser alterado.' : 'Este pedido está sendo enviado. Aguarde.')
  const v = validarPedido(b.itens); if (!v.ok) throw fail(400, v.erro)
  const cli = await tabelaDoCliente(c, o.pessoa_rein_id)   // reconfere a carteira e usa a tabela ATUAL do cliente
  const linhas = await precificar(db, t, cli.tabelaId, cli.tabelaNome, v.itens)
  await db.batch([
    db.prepare("UPDATE pre_orders SET tabela_rein_id=?, total=?, note=?, status='RASCUNHO', error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(cli.tabelaId, totalDe(linhas), clean(b.observacao, 500) || null, o.id, t),
    ...gravarItens(db, t, o.id, linhas),
  ])
  return c.json({ ok: true, total: totalDe(linhas) })
})

prepedidos.delete('/:id', async c => {
  const t = tenantOf(c), o = await carregar(c, c.req.param('id'))
  if (!EDITAVEL.includes(o.status)) throw fail(409, 'Só dá para excluir pedido que ainda não foi enviado ao ERP.')
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM pre_order_items WHERE pre_order_id=? AND tenant_id=?').bind(o.id, t), c.env.DB.prepare('DELETE FROM pre_orders WHERE id=? AND tenant_id=?').bind(o.id, t)])
  return c.json({ ok: true })
})

/* ---------- envio ao ERP ---------- */
async function carregarConfig(db: D1Database, t: string) {
  const r = await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='pedido_erp'").bind(t).first<{ value: string }>()
  try { return mesclarConfig(r ? JSON.parse(r.value) : null) } catch { return mesclarConfig(null) }
}
const escritaLigada = async (db: D1Database, t: string) => !!(await db.prepare('SELECT pedido_write_enabled AS e FROM tenant_rein WHERE tenant_id=?').bind(t).first<{ e: number }>())?.e

/**
 * Com a trava `pedido_write_enabled` desligada (padrão), o pedido fica PENDENTE_FLAG e o vendedor usa o resumo.
 * Ligada, cria o pedido no ERP UMA vez só: o status ENVIANDO é reservado antes da chamada e nenhuma falha repete sozinha.
 */
prepedidos.post('/:id/enviar', async c => {
  const t = tenantOf(c), db = c.env.DB, o = await carregar(c, c.req.param('id')), me = c.get('session')
  if (o.status === 'ENVIADO') throw fail(409, 'Este pedido já foi enviado ao ERP.')
  if (o.status === 'ENVIANDO') throw fail(409, 'Este pedido está sendo enviado. Se travou, peça ao gestor para conferir no ERP.')
  const linhas = await linhasDe(db, t, o.id)
  if (!linhas.length) throw fail(400, 'O pedido está vazio.')

  if (!(await escritaLigada(db, t))) {
    await db.prepare("UPDATE pre_orders SET status='PENDENTE_FLAG', error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(o.id, t).run()
    return c.json({ status: 'PENDENTE_FLAG', aviso: 'O envio direto ao ERP está desligado para esta empresa. Use o resumo para copiar e colar no ERP ou mandar no WhatsApp.' })
  }
  const creds = await loadReinCreds(c.env, t)
  if (!creds) throw fail(400, 'Configure a conexão com o ERP primeiro.')
  if (!creds.mock && (!creds.clientId || !creds.clientSecret || !creds.database)) throw fail(400, 'Preencha as credenciais do ERP ou ligue o modo de teste.')
  const vend = await db.prepare('SELECT rein_user_id FROM members WHERE tenant_id=? AND user_id=?').bind(t, o.user_id).first<{ rein_user_id: number | null }>()
  const corpo = montarCorpoPedido({ pessoaId: o.pessoa_rein_id, tabelaPrecoId: o.tabela_rein_id, vendedorReinId: vend?.rein_user_id ?? null, linhas, hoje: hojeLocal() }, await carregarConfig(db, t))
  if (!corpo.ok) throw fail(400, corpo.erro)

  const claim = await db.prepare(`UPDATE pre_orders SET status='ENVIANDO', updated_at=datetime('now') WHERE id=? AND tenant_id=? AND status IN ('RASCUNHO','PENDENTE_FLAG','ERRO')`).bind(o.id, t).run()
  if (!claim.meta.changes) throw fail(409, 'Este pedido já está sendo enviado ou foi enviado.')
  try {
    const r = await reinApiFor(creds).createPedido(corpo.corpo)
    await db.prepare("UPDATE pre_orders SET status='ENVIADO', pedido_rein_id=?, error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(r.id, o.id, t).run()
    await audit(db, t, me.userId, 'prepedido.enviado', { id: o.id, pedidoReinId: r.id, total: o.total, teste: creds.mock })
    return c.json({ status: 'ENVIADO', pedidoReinId: r.id, modoTeste: creds.mock })
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300)
    await db.prepare("UPDATE pre_orders SET status='ERRO', error=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(msg, o.id, t).run()
    await audit(db, t, me.userId, 'prepedido.erro', { id: o.id, erro: msg })
    throw fail(502, `O ERP não confirmou o pedido: ${msg}. Se foi falha de conexão, confira no ERP se o pedido já entrou ANTES de enviar de novo.`)
  }
})

/** Gestor resolve um pedido travado depois de conferir no ERP: marca como enviado (com o número) ou volta para rascunho. */
prepedidos.post('/:id/resolver', requireRole('manager'), async c => {
  const t = tenantOf(c), o = await carregar(c, c.req.param('id')), b = await c.req.json<any>()
  if (!['ENVIANDO', 'ERRO'].includes(o.status)) throw fail(409, 'Só dá para resolver pedido com erro ou travado.')
  if (b.resultado === 'ENVIADO') {
    const n = Number(b.pedidoReinId)
    await c.env.DB.prepare("UPDATE pre_orders SET status='ENVIADO', pedido_rein_id=?, error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(Number.isInteger(n) && n > 0 ? n : null, o.id, t).run()
  } else if (b.resultado === 'RASCUNHO') {
    await c.env.DB.prepare("UPDATE pre_orders SET status='RASCUNHO', error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(o.id, t).run()
  } else throw fail(400, 'Escolha “ENVIADO” ou “RASCUNHO”.')
  await audit(c.env.DB, t, c.get('session').userId, 'prepedido.resolvido', { id: o.id, resultado: b.resultado })
  return c.json({ ok: true })
})
