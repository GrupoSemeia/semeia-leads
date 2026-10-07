import { Hono } from 'hono'
import { type App, tenantOf } from '../lib'

/** Foto de produto. A chave do R2 vem do índice da empresa da sessão, nunca da URL; só entram JPEG/PNG/WEBP (conferido no sync). */
export const imagens = new Hono<App>()

async function servir(c: any, pos: number) {
  const t = tenantOf(c), id = Number(c.req.param('produtoId'))
  const r = await c.env.DB.prepare('SELECT r2_key AS k, hash, content_type AS tipo FROM product_images WHERE tenant_id=? AND produto_rein_id=? AND pos=?').bind(t, id, pos).first()
  if (!r || !c.env.IMAGENS) return c.json({ erro: 'Imagem não encontrada.' }, 404)
  const etag = `"${r.hash}"`
  const base = { etag, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" }
  if (c.req.header('if-none-match') === etag) return new Response(null, { status: 304, headers: base })
  const obj = await c.env.IMAGENS.get(r.k)
  if (!obj) return c.json({ erro: 'Imagem não encontrada.' }, 404)
  return new Response(obj.body, { headers: { ...base, 'content-type': r.tipo } })
}
imagens.get('/:produtoId{[0-9]+}', c => servir(c, 0))
imagens.get('/:produtoId{[0-9]+}/:pos{[0-2]}', c => servir(c, Number(c.req.param('pos'))))
