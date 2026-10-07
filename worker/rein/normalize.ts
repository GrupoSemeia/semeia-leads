/**
 * Tradução dos JSONs da Rein para os tipos internos. ÚNICO lugar que conhece os nomes dos campos do ERP.
 * ⚠️ VALIDAR (docs/02-api-rein.md): nomes exatos, formato de datas e formato da resposta de listas são hipóteses.
 * Cada campo aceita alguns apelidos; ajuste aqui quando a Rein confirmar.
 */
import { z } from 'zod'

type Obj = Record<string, any>
const pick = (o: Obj, ...keys: string[]) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined }
const str = (v: unknown) => (v === undefined || v === null ? null : String(v).trim() || null)
const int = (v: unknown) => { const n = Number(v); return v === undefined || v === null || v === '' || !Number.isFinite(n) ? null : Math.trunc(n) }
const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'S' || v === 's' || v === 'true'
export const cents = (v: unknown) => { const n = Number(typeof v === 'string' ? v.replace(',', '.') : v); return Number.isFinite(n) ? Math.round(n * 100) : 0 }
export const onlyDigits = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** ⚠️ VALIDAR: a Rein manda datas sem fuso; assumimos horário de Brasília (UTC-3). */
export const ERP_UTC_OFFSET_HOURS = -3
export function erpDateToUtc(v: unknown): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', se = '00', tz] = m
  const base = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)
  let ms = base
  if (tz === 'Z') ms = base
  else if (tz) { const sign = tz[0] === '-' ? -1 : 1; const t = tz.replace(':', ''); ms = base - sign * (+t.slice(1, 3) * 60 + +t.slice(3, 5)) * 60000 }
  else ms = base - ERP_UTC_OFFSET_HOURS * 3600000
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/** A lista pode vir como array puro ou embrulhada ({Data:[...]}, {Items:[...]}…). */
export function unwrapList(json: unknown): Obj[] {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const o = json as Obj
    for (const k of ['Data', 'data', 'Items', 'items', 'Itens', 'Results', 'results', 'Registros', 'registros', 'Lista', 'lista']) if (Array.isArray(o[k])) return o[k]
    for (const v of Object.values(o)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v as Obj[]
  }
  return []
}
export function unwrapOne(json: unknown): Obj | null {
  if (Array.isArray(json)) return (json[0] as Obj) ?? null
  if (json && typeof json === 'object') {
    const o = json as Obj
    for (const k of ['Data', 'data', 'Item', 'item', 'Resultado']) if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) return o[k]
    return o
  }
  return null
}

const withId = z.object({ id: z.number().int() })
const idOf = (o: Obj) => withId.parse({ id: int(pick(o, 'Id', 'id', 'ID')) }).id

/* ---------- tipos internos ---------- */
export type Usuario = { id: number; name: string; raw: Obj }
export type TabelaPreco = { id: number; name: string }
export type Categoria = { id: number; name: string; parentId: number | null }
export type Marca = { id: number; name: string }
export type Preco = { tabelaId: number; price: number; cost: number | null; margin: number | null }
export type ImagemProduto = { ordem: number; base64: string }
export type Produto = { id: number; imagens: ImagemProduto[]; name: string; code: string | null; sku: string | null; brandId: number | null; categoryIds: number[]; active: boolean; isService: boolean; modifiedAt: string | null; precos: Preco[]; raw: Obj }
export type Pessoa = { id: number; name: string; legalName: string | null; cnpj: string | null; cnae: string | null; whatsapp: string | null; phone: string | null; email: string | null
  city: string | null; uf: string | null; priceTableId: number | null; creditLimit: number | null; channelId: number | null; registeredAt: string | null; modifiedAt: string | null; raw: Obj }
export type PedidoItem = { produtoId: number | null; qty: number; unitPrice: number }
export type Pedido = { id: number; pessoaId: number | null; vendedorId: number | null; channelId: number | null; orderedAt: string; total: number
  finalized: boolean | null; cancelled: boolean; items: PedidoItem[] | null; raw: Obj }

export const nUsuario = (o: Obj): Usuario => ({ id: idOf(o), name: str(pick(o, 'Nome', 'Name', 'Login')) ?? '', raw: o })
export const nTabelaPreco = (o: Obj): TabelaPreco => ({ id: idOf(o), name: str(pick(o, 'Nome', 'Descricao', 'Name')) ?? '' })
export const nCategoria = (o: Obj): Categoria => ({ id: idOf(o), name: str(pick(o, 'Nome', 'Name')) ?? '', parentId: int(pick(o, 'CategoriaPaiId', 'PaiId')) })
export const nMarca = (o: Obj): Marca => ({ id: idOf(o), name: str(pick(o, 'Nome', 'Name')) ?? '' })

export function nProduto(o: Obj): Produto {
  const grades: Obj[] = Array.isArray(o.ProdutoGrade) ? o.ProdutoGrade : []
  const byTable = new Map<number, Preco>()
  for (const g of grades) for (const m of (Array.isArray(g.ProdutoMargem) ? g.ProdutoMargem : []) as Obj[]) {
    const tabelaId = int(pick(m, 'TabelaPrecoId', 'CodTabelaPreco')); if (tabelaId === null) continue
    const price = cents(pick(m, 'PrecoComDesconto', 'Preco', 'Valor') ?? 0)
    const cur = byTable.get(tabelaId)
    if (!cur || g.Principal) byTable.set(tabelaId, { tabelaId, price, cost: pick(m, 'UltimoCustoEmReal', 'Custo') === undefined ? null : cents(pick(m, 'UltimoCustoEmReal', 'Custo')), margin: pick(m, 'Margem') === undefined ? null : Number(m.Margem) })
  }
  // fotos: grade principal primeiro; o binário vai para o R2 (sync/imagens.ts), nunca para o `raw`
  const imagens: ImagemProduto[] = [...grades].sort((a, b) => Number(!!b.Principal) - Number(!!a.Principal)).flatMap(g => (Array.isArray(g.ProdutoImagem) ? g.ProdutoImagem : []) as Obj[])
    .map((im, i) => ({ ordem: int(pick(im, 'OrdemExibicao')) ?? i, base64: typeof im.BinarioArquivo === 'string' ? im.BinarioArquivo : '' })).filter(im => im.base64)
  // o JSON bruto guardado não leva imagens (binário enorme) nem margens (ficam só em rein_precos)
  const raw: Obj = { ...o, ProdutoGrade: grades.map(g => { const { ProdutoImagem, ProdutoMargem, ...rest } = g; return rest }) }
  return {
    id: idOf(o), imagens, name: str(pick(o, 'Nome', 'Name')) ?? '', code: str(pick(o, 'CodigoProduto', 'Codigo')), sku: str(pick(o, 'SkuGeral', 'Sku')) ?? str(grades[0]?.Sku),
    brandId: int(pick(o, 'ProdutoMarcaId', 'MarcaId')),
    categoryIds: (Array.isArray(o.ProdutoCategoria) ? o.ProdutoCategoria : []).map((c: Obj) => int(c.CategoriaId)).filter((x: number | null): x is number => x !== null),
    active: o.Ativo === undefined ? true : bool(o.Ativo), isService: bool(o.Servico), modifiedAt: erpDateToUtc(pick(o, 'DataUltimaModificacao')), precos: [...byTable.values()], raw,
  }
}

export function nPessoa(o: Obj): Pessoa {
  const ends: Obj[] = Array.isArray(o.CadastroGeralEndereco) ? o.CadastroGeralEndereco : []
  const end = ends.find(e => e.Principal) ?? ends[0] ?? {}
  const cnpj = onlyDigits(pick(o, 'Cnpj', 'CpfCnpj'))
  return {
    id: idOf(o), name: str(pick(o, 'Nome', 'Name')) ?? '', legalName: str(o.RazaoSocial), cnpj: cnpj || null, cnae: str(o.Cnae),
    whatsapp: str(pick(o, 'Whatsapp', 'Celular')), phone: str(pick(o, 'Fone', 'Telefone')), email: str(pick(o, 'EmailMalaDireta', 'EmailFinanceiro', 'Email')),
    city: str(pick(end, 'Municipio', 'Cidade')), uf: str(pick(end, 'Estado', 'Uf')), priceTableId: int(o.TabelaPrecoPadrao),
    creditLimit: o.LimiteDeCredito === undefined || o.LimiteDeCredito === null ? null : cents(o.LimiteDeCredito), channelId: int(o.CanalVendaId),
    registeredAt: erpDateToUtc(o.DataCadastro), modifiedAt: erpDateToUtc(o.DataUltimaModificacao), raw: o,
  }
}

export function nPedido(o: Obj): Pedido {
  const lines = pick(o, 'Produto', 'Itens', 'Items')
  const items: PedidoItem[] | null = Array.isArray(lines)
    ? lines.map((l: Obj) => ({ produtoId: int(pick(l, 'IdProduto', 'ProdutoId')), qty: Number(pick(l, 'QtdProduto', 'Quantidade') ?? 0) || 0, unitPrice: cents(pick(l, 'ValorUnitario', 'Preco') ?? 0) }))
    : null
  const orderedAt = erpDateToUtc(pick(o, 'DataMov', 'DataMovimento', 'Data'))
  if (!orderedAt) throw new Error('Pedido sem data')
  const total = pick(o, 'ValorTotal', 'Total')
  return {
    id: idOf(o), pessoaId: int(pick(o, 'CodDestino', 'PessoaId')), vendedorId: int(pick(o, 'CodVendedor', 'VendedorId')), channelId: int(pick(o, 'CanalVendaId')),
    orderedAt, total: total !== undefined ? cents(total) : (items ?? []).reduce((s, i) => s + Math.round(i.qty * i.unitPrice), 0),
    finalized: o.Finalizado === undefined ? null : bool(o.Finalizado), cancelled: bool(pick(o, 'Cancelado', 'Cancelada')), items, raw: o,
  }
}

/** Id do registro criado, na resposta de um PUT (⚠️ VALIDAR o formato real). */
export const idDaResposta = (o: Obj | null): number | null => (o ? int(pick(o, 'Id', 'id', 'PedidoId', 'ID')) : null)
