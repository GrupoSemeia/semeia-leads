/**
 * Interface tipada da API Rein. Duas implementações: real (HTTP assinado) e mock (fixtures).
 * O sync só conhece `ReinApi`, nunca `fetch`.
 */
import { reinFetch, type ReinCredentials } from './client'
import { unwrapList, unwrapOne, nUsuario, nTabelaPreco, nCategoria, nMarca, nProduto, nPessoa, nPedido,
  type Usuario, type TabelaPreco, type Categoria, type Marca, type Produto, type Pessoa, type Pedido } from './normalize'
import { mockApi } from './mock'

export type Page<T> = { items: T[]; ids: number[] }
export type PedidoFiltro = { de: string; ate: string; page: number }   // datas AAAA-MM-DD (dia local do ERP)

export interface ReinApi {
  listUsuarios(page: number): Promise<Page<Usuario>>
  listTabelasPreco(page: number): Promise<Page<TabelaPreco>>
  listCategorias(page: number): Promise<Page<Categoria>>
  listMarcas(page: number): Promise<Page<Marca>>
  listProdutos(page: number): Promise<Page<Produto>>
  listPessoas(page: number): Promise<Page<Pessoa>>
  listPedidosVenda(f: PedidoFiltro): Promise<Page<Pedido>>
  getPedido(id: number): Promise<Pedido | null>
}

/** ⚠️ VALIDAR: base da paginação (0 ou 1) e nome do parâmetro. */
export const PAGE_BASE = 1
/** TipoMovimento 4 = Venda (docs/02-api-rein.md §3.6) */
const TIPO_VENDA = 4

function realApi(creds: ReinCredentials): ReinApi {
  const list = async <T extends { id: number }>(path: string, params: Record<string, string | number>, norm: (o: any) => T): Promise<Page<T>> => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
    const rows = unwrapList(await reinFetch<unknown>('GET', `/api/v1/${path}${qs ? `?${qs}` : ''}`, creds))
    const items = rows.map(norm)
    return { items, ids: items.map(i => i.id) }
  }
  const page = (n: number) => ({ page: PAGE_BASE + n })   // n = 0, 1, 2…
  return {
    listUsuarios: n => list('usuario', page(n), nUsuario),
    listTabelasPreco: n => list('tabela-preco', page(n), nTabelaPreco),
    listCategorias: n => list('categoria', page(n), nCategoria),
    listMarcas: n => list('marca', page(n), nMarca),
    listProdutos: n => list('produto', page(n), nProduto),
    listPessoas: n => list('pessoa', page(n), nPessoa),
    // ⚠️ VALIDAR: formato das datas dos filtros
    listPedidosVenda: f => list('pedido', { DataMovInicial: f.de, DataMovFinal: f.ate, TipoMovimento: TIPO_VENDA, ...page(f.page) }, nPedido),
    getPedido: async id => { const o = unwrapOne(await reinFetch<unknown>('GET', `/api/v1/pedido/${id}`, creds)); return o ? nPedido(o) : null },
  }
}

export const reinApiFor = (creds: ReinCredentials & { mock: boolean }): ReinApi => (creds.mock ? mockApi() : realApi(creds))
