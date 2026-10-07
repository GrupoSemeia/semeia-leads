/**
 * Imagens de produto vindas do ERP (base64 dentro do cadastro). Funções PURAS.
 * Nunca confiamos no tipo declarado nem no nome do arquivo: o tipo vem do conteúdo (assinatura dos primeiros bytes),
 * e só entram JPEG, PNG e WEBP (SVG e outros formatos que executam código ficam de fora).
 */
export const MAX_BYTES_IMAGEM = 3 * 1024 * 1024
export const MAX_IMAGENS_POR_PRODUTO = 3
export const MAX_UPLOADS_POR_PAGINA = 20   // limite de gravações no R2 por página do sync; o resto entra na próxima sincronização

export type TipoImagem = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' }

export function detectarImagem(b: Uint8Array): TipoImagem | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' }
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { mime: 'image/png', ext: 'png' }
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP') return { mime: 'image/webp', ext: 'webp' }
  return null
}

/** Decodifica base64 recusando o que passa do limite ANTES de alocar (resposta enorme não derruba o Worker). */
export function decodificarBase64(s: unknown, max = MAX_BYTES_IMAGEM): Uint8Array<ArrayBuffer> | null {
  if (typeof s !== 'string') return null
  const limpo = s.replace(/^data:[^;,]*;base64,/, '').replace(/\s+/g, '')
  if (!limpo || limpo.length > Math.ceil((max * 4) / 3) + 4 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(limpo)) return null
  try {
    const bin = atob(limpo.replace(/-/g, '+').replace(/_/g, '/'))
    if (bin.length > max) return null
    const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch { return null }
}

export type ImagemBruta = { ordem: number; base64: string }
/** As primeiras fotos pela ordem de exibição do ERP (a principal vem primeiro). */
export const escolherImagens = (imgs: ImagemBruta[], max = MAX_IMAGENS_POR_PRODUTO) => [...imgs].sort((a, b) => a.ordem - b.ordem).slice(0, max)

/** Chave no R2: sempre montada no servidor com a empresa da sessão; nada do que vem do ERP ou do navegador entra no caminho. */
export const chaveDaImagem = (tenantId: string, produtoId: number, pos: number, hash: string, ext: string) => `${tenantId}/${produtoId}/${pos}-${hash.slice(0, 16)}.${ext}`

/** Valida e prepara uma imagem. */
export function prepararImagem(base64: unknown): { ok: true; bytes: Uint8Array<ArrayBuffer>; tipo: TipoImagem } | { ok: false; motivo: 'invalida' | 'formato' } {
  const bytes = decodificarBase64(base64); if (!bytes) return { ok: false, motivo: 'invalida' }
  const tipo = detectarImagem(bytes); if (!tipo) return { ok: false, motivo: 'formato' }
  return { ok: true, bytes, tipo }
}
