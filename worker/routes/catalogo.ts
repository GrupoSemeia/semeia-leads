import { Hono } from 'hono'
import { type App, tenantOf, fail, clean, digits } from '../lib'

export const catalogo = new Hono<App>()
const PAGE = 30

/** Tabela de preço do cliente. Vendedor só consulta cliente da própria carteira. */
export async function tabelaDoCliente(c: any, pessoaId: number): Promise<{ id: number; nome: string; tabelaId: number | null; tabelaNome: string | null }> {
  const s = c.get('session'), meu = s.role === 'seller'
  const r = await c.env.DB.prepare(
    `SELECT p.rein_id AS id, p.name AS nome, p.price_table_id AS tabelaId, tp.name AS tabelaNome
       FROM accounts a JOIN rein_pessoas p ON p.tenant_id = a.tenant_id AND p.rein_id = a.pessoa_rein_id AND p.deleted_at IS NULL
       LEFT JOIN rein_tabelas_preco tp ON tp.tenant_id = p.tenant_id AND tp.rein_id = p.price_table_id
      WHERE a.tenant_id = ? AND a.pessoa_rein_id = ?${meu ? ' AND a.owner_id = ?' : ''}`).bind(...[tenantOf(c), pessoaId, ...(meu ? [s.userId] : [])]).first()
  if (!r) throw fail(404, 'Cliente não encontrado.')
  return r as any
}

/** Filtros da tela (categorias e marcas). */
catalogo.get('/filtros', async c => {
  const t = tenantOf(c), db = c.env.DB
  const [cat, mar] = await Promise.all([
    db.prepare('SELECT rein_id AS id, name FROM rein_categorias WHERE tenant_id=? AND deleted_at IS NULL ORDER BY name').bind(t).all(),
    db.prepare('SELECT rein_id AS id, name FROM rein_marcas WHERE tenant_id=? AND deleted_at IS NULL ORDER BY name').bind(t).all(),
  ])
  return c.json({ categorias: cat.results, marcas: mar.results })
})

/**
 * Busca de produtos. Com `?cliente=ID` traz o preço da tabela daquele cliente (null = produto sem preço nessa tabela).
 * Nunca devolve custo nem margem.
 */
catalogo.get('/', async c => {
  const t = tenantOf(c), db = c.env.DB, q = c.req.query()
  const cli = q.cliente ? await tabelaDoCliente(c, Number(q.cliente)) : null
  const where = ['p.tenant_id = ?', 'p.deleted_at IS NULL', 'p.active = 1'], args: unknown[] = []
  const busca = clean(q.q, 60).toLowerCase()
  if (busca) { const like = `%${busca.replace(/[%_]/g, '')}%`; where.push('(lower(p.name) LIKE ? OR lower(p.code) LIKE ? OR lower(p.sku) LIKE ?)'); args.push(like, like, like) }
  if (digits(q.categoria ?? '')) { where.push('EXISTS (SELECT 1 FROM json_each(p.category_ids) j WHERE j.value = ?)'); args.push(Number(digits(q.categoria))) }
  if (digits(q.marca ?? '')) { where.push('p.brand_id = ?'); args.push(Number(digits(q.marca))) }
  const page = Math.max(0, Math.floor(Number(q.page) || 0)), tabela = cli?.tabelaId ?? -1
  const from = `FROM rein_produtos p LEFT JOIN rein_marcas m ON m.tenant_id = p.tenant_id AND m.rein_id = p.brand_id
                LEFT JOIN rein_precos pr ON pr.tenant_id = p.tenant_id AND pr.produto_rein_id = p.rein_id AND pr.tabela_rein_id = ?
                LEFT JOIN product_images im ON im.tenant_id = p.tenant_id AND im.produto_rein_id = p.rein_id AND im.pos = 0
                WHERE ${where.join(' AND ')}`
  const [rows, total] = await Promise.all([
    db.prepare(`SELECT p.rein_id AS id, p.name, p.code, p.sku, m.name AS marca, p.category_ids AS categorias, pr.price AS preco, substr(im.hash, 1, 12) AS imagem ${from} ORDER BY p.name LIMIT ${PAGE} OFFSET ?`).bind(tabela, t, ...args, page * PAGE).all<any>(),
    db.prepare(`SELECT COUNT(*) AS n ${from}`).bind(tabela, t, ...args).first<{ n: number }>(),
  ])
  return c.json({
    cliente: cli && { id: cli.id, nome: cli.nome, tabela: cli.tabelaNome, semTabela: cli.tabelaId === null },
    itens: rows.results.map((r: any) => ({ ...r, categorias: safeJson(r.categorias), preco: cli ? r.preco ?? null : undefined })),
    total: total?.n ?? 0, pagina: page, tamanho: PAGE,
  })
})
const safeJson = (s: string) => { try { return JSON.parse(s) as number[] } catch { return [] } }
