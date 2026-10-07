/** Grava no R2 as fotos de produto que vêm do ERP e mantém o índice (product_images). Só regrava quando a foto muda. */
import type { Env } from '../lib'
import type { Produto } from '../rein/normalize'
import { escolherImagens, prepararImagem, chaveDaImagem, MAX_UPLOADS_POR_PAGINA } from '../domain/imagens'

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')

export async function salvarImagensProdutos(env: Env, tenant: string, produtos: Produto[], orcamento = MAX_UPLOADS_POR_PAGINA): Promise<{ gravadas: number; invalidas: number; adiadas: number }> {
  const r = { gravadas: 0, invalidas: 0, adiadas: 0 }
  const com = produtos.filter(p => p.imagens.length), bucket = env.IMAGENS
  if (!bucket || !com.length) return r
  const db = env.DB, marcas = com.map(() => '?').join(',')
  const atuais = await db.prepare(`SELECT produto_rein_id AS p, pos, hash, r2_key AS k FROM product_images WHERE tenant_id=? AND produto_rein_id IN (${marcas})`).bind(tenant, ...com.map(p => p.id)).all<any>()
  const por = new Map<string, { hash: string; k: string }>(atuais.results.map((x: any) => [`${x.p}:${x.pos}`, x]))
  for (const p of com) {
    for (const [pos, img] of escolherImagens(p.imagens).entries()) {
      const prep = prepararImagem(img.base64)
      if (!prep.ok) { r.invalidas++; continue }   // formato proibido (SVG etc.) ou arquivo grande/corrompido: ignora, não derruba o sync
      const hash = hex(await crypto.subtle.digest('SHA-256', prep.bytes)), ant = por.get(`${p.id}:${pos}`)
      if (ant?.hash === hash) continue
      if (orcamento <= 0) { r.adiadas++; continue }
      const key = chaveDaImagem(tenant, p.id, pos, hash, prep.tipo.ext)
      await bucket.put(key, prep.bytes, { httpMetadata: { contentType: prep.tipo.mime } })
      await db.prepare(`INSERT INTO product_images (tenant_id, produto_rein_id, pos, r2_key, hash, content_type, bytes) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(tenant_id, produto_rein_id, pos) DO UPDATE SET r2_key=excluded.r2_key, hash=excluded.hash, content_type=excluded.content_type, bytes=excluded.bytes, updated_at=datetime('now')`)
        .bind(tenant, p.id, pos, key, hash, prep.tipo.mime, prep.bytes.length).run()
      if (ant && ant.k !== key) await bucket.delete(ant.k).catch(() => {})   // foto trocada: apaga o arquivo antigo
      orcamento--; r.gravadas++
    }
  }
  return r
}
