/**
 * Rein de mentirinha (REIN_MOCK / "modo de teste"): dados determinísticos de uma distribuidora de informática.
 * Serve para desenvolver e demonstrar sem credenciais. A lista de pedidos vem SEM itens (como a Rein pode fazer),
 * para exercitar a busca de detalhe.
 */
import type { ReinApi, Page } from './api'
import { nUsuario, nTabelaPreco, nCategoria, nMarca, nProduto, nPessoa, nPedido } from './normalize'

export const MOCK_PAGE_SIZE = 25
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function cnpjFrom(n: number): string {
  const d = String(10_000_000 + n).padStart(8, '0').split('').map(Number).concat([0, 0, 0, 1])
  const dv = (arr: number[]) => { const w = arr.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = arr.reduce((a, x, i) => a + x * w[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const a = dv(d); const b = dv([...d, a]); return [...d, a, b].join('')
}
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

const CIDADES: [string, string][] = [['Curitiba', 'PR'], ['Itajaí', 'SC'], ['Joinville', 'SC'], ['Londrina', 'PR'], ['Maringá', 'PR'], ['Florianópolis', 'SC'], ['Blumenau', 'SC'], ['Ponta Grossa', 'PR']]
const PNGS = ['iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+PQfAALnAfLfd0HlAAAAAElFTkSuQmCC', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNY/F8IAAP9AbXUHg2SAAAAAElFTkSuQmCC', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4f50BAASvAdfA0BA+AAAAAElFTkSuQmCC']
const SVG_PERIGOSO = btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')   // produto 5: foto que NÃO pode entrar
const CATEGORIAS = ['Notebooks', 'Periféricos', 'Armazenamento', 'Redes', 'Componentes', 'Cabos e adaptadores']
const MARCAS = ['Kingston', 'Logitech', 'TP-Link', 'Intel', 'Multilaser', 'Seagate']

type World = ReturnType<typeof build>
let cache: World | null = null
function build() {
  const r = rng(42)
  const usuarios = [{ Id: 1, Nome: 'Carlos Vendedor' }, { Id: 2, Nome: 'Mariana Vendedora' }, { Id: 3, Nome: 'Rafael Vendedor' }, { Id: 4, Nome: 'Juliana Vendedora' }]
  const tabelas = [{ Id: 1, Nome: 'Revenda' }, { Id: 2, Nome: 'Atacado' }]
  const categorias = CATEGORIAS.map((Nome, i) => ({ Id: i + 1, Nome }))
  const marcas = MARCAS.map((Nome, i) => ({ Id: i + 1, Nome }))
  const produtos = Array.from({ length: 40 }, (_, i) => {
    const base = 2000 + Math.floor(r() * 400000) / 100
    return { Id: 100 + i, Nome: `${CATEGORIAS[i % 6]} ${MARCAS[i % 6]} modelo ${i + 1}`, CodigoProduto: `P${1000 + i}`, SkuGeral: `SKU-${1000 + i}`, ProdutoMarcaId: (i % 6) + 1,
      ProdutoCategoria: [{ CategoriaId: (i % 6) + 1 }], Ativo: true, Servico: false, DataUltimaModificacao: '2026-09-01T10:00:00',
      ProdutoGrade: [{ Sku: `SKU-${1000 + i}`, Principal: true, Ativo: true, ProdutoImagem: i === 6 ? [] : i === 5 ? [{ OrdemExibicao: 1, NomeArquivo: 'x.svg', TipoArquivo: 'image/svg+xml', BinarioArquivo: SVG_PERIGOSO }]
          : [{ OrdemExibicao: 1, NomeArquivo: 'frente.png', TipoArquivo: 'image/png', BinarioArquivo: PNGS[i % 3] }, ...(i % 4 === 0 ? [{ OrdemExibicao: 2, NomeArquivo: 'lado.png', TipoArquivo: 'image/png', BinarioArquivo: PNGS[(i + 1) % 3] }] : [])],
        ProdutoMargem: [{ TabelaPrecoId: 1, PrecoComDesconto: +(base * 1.25).toFixed(2), UltimoCustoEmReal: +base.toFixed(2), Margem: 20 },
          { TabelaPrecoId: 2, PrecoComDesconto: +(base * 1.15).toFixed(2), UltimoCustoEmReal: +base.toFixed(2), Margem: 13 }] }] }
  })
  const pessoas = Array.from({ length: 60 }, (_, i) => {
    const [Municipio, Estado] = CIDADES[i % CIDADES.length]
    return { Id: 1000 + i, Nome: `Revenda ${i + 1} Informática`, RazaoSocial: `Revenda ${i + 1} Comércio de Informática LTDA`, Cnpj: cnpjFrom(i + 1), Cnae: '4751201',
      Whatsapp: `419${String(90000000 + i * 137).slice(0, 8)}`, EmailMalaDireta: `contato${i + 1}@revenda.test`, TabelaPrecoPadrao: i % 3 === 0 ? 2 : 1, LimiteDeCredito: 5000 + (i % 7) * 2500,
      CanalVendaId: 1, DataCadastro: '2023-03-10T09:00:00', DataUltimaModificacao: '2026-08-15T09:00:00', TipoCliente: [{ Id: 1, Nome: 'Revenda' }],
      CadastroGeralEndereco: [{ Municipio, Estado, Principal: true }] }
  })
  // pedidos: cada cliente compra com um intervalo próprio nos últimos 24 meses (alguns pararam de comprar)
  const hoje = Date.UTC(2026, 9, 7)
  const pedidos: any[] = []
  let id = 50_000
  pessoas.forEach((p, i) => {
    const intervalo = 10 + (i * 7) % 60, parouHa = i % 9 === 0 ? 200 + (i % 5) * 60 : 0
    for (let dia = 730 - Math.floor(r() * intervalo); dia >= parouHa; dia -= Math.max(5, Math.floor(intervalo * (0.7 + r() * 0.6)))) {
      const itens = Array.from({ length: 1 + Math.floor(r() * 4) }, () => { const pr = produtos[Math.floor(r() * produtos.length)]; const m = pr.ProdutoGrade[0].ProdutoMargem[p.TabelaPrecoPadrao - 1]
        return { IdProduto: pr.Id, QtdProduto: 1 + Math.floor(r() * 8), ValorUnitario: m.PrecoComDesconto } })
      const data = new Date(hoje - dia * 864e5 + 13 * 3600e3)
      pedidos.push({ Id: id++, CodDestino: p.Id, CodVendedor: 1 + (i % 4), CanalVendaId: 1, DataMov: `${iso(data)}T${pad(data.getUTCHours())}:${pad(data.getUTCMinutes())}:00`,
        ValorTotal: +itens.reduce((s, x) => s + x.QtdProduto * x.ValorUnitario, 0).toFixed(2), Finalizado: true, Cancelado: r() < 0.03, Produto: itens })
    }
  })
  return { usuarios, tabelas, categorias, marcas, produtos, pessoas, pedidos }
}
const world = () => (cache ??= build())

function paged<T extends { id: number }>(rows: any[], n: number, norm: (o: any) => T): Page<T> {
  const items = rows.slice(n * MOCK_PAGE_SIZE, (n + 1) * MOCK_PAGE_SIZE).map(norm)
  return { items, ids: items.map(i => i.id) }
}

export function mockApi(): ReinApi {
  const w = world()
  return {
    listUsuarios: async n => paged(w.usuarios, n, nUsuario),
    listTabelasPreco: async n => paged(w.tabelas, n, nTabelaPreco),
    listCategorias: async n => paged(w.categorias, n, nCategoria),
    listMarcas: async n => paged(w.marcas, n, nMarca),
    listProdutos: async n => paged(w.produtos, n, nProduto),
    listPessoas: async n => paged(w.pessoas, n, nPessoa),
    listPedidosVenda: async f => {
      const rows = w.pedidos.filter(p => { const d = String(p.DataMov).slice(0, 10); return d >= f.de && d <= f.ate }).map(({ Produto, ...head }) => head)   // lista sem itens
      return paged(rows, f.page, nPedido)
    },
    getPessoa: async id => (w.pessoas.find(x => x.Id === id) as Record<string, unknown> | undefined) ?? null,
    updatePessoa: async () => {},   // modo de teste: finge que o ERP aceitou
    createPessoa: async () => ({ id: 800_000 + Math.floor(Math.random() * 99_999) }),
    createPedido: async () => ({ id: 900_000 + Math.floor(Math.random() * 99_999) }),   // modo de teste: finge que o ERP aceitou
    getPedido: async id => { const p = w.pedidos.find(x => x.Id === id); return p ? nPedido(p) : null },
  }
}
