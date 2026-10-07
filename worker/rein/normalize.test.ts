import { describe, it, expect } from 'vitest'
import { unwrapList, unwrapOne, nPessoa, nPedido, nProduto, erpDateToUtc, cents } from './normalize'

describe('unwrapList', () => {
  it('aceita array puro e listas embrulhadas', () => {
    expect(unwrapList([{ Id: 1 }])).toHaveLength(1)
    expect(unwrapList({ Data: [{ Id: 1 }, { Id: 2 }] })).toHaveLength(2)
    expect(unwrapList({ total: 2, Items: [{ Id: 1 }] })).toHaveLength(1)
    expect(unwrapList({})).toEqual([])
    expect(unwrapList(null)).toEqual([])
  })
  it('unwrapOne', () => { expect(unwrapOne({ Data: { Id: 3 } })).toEqual({ Id: 3 }); expect(unwrapOne({ Id: 4 })).toEqual({ Id: 4 }) })
})

describe('datas e dinheiro', () => {
  it('data sem fuso é horário de Brasília → UTC', () => { expect(erpDateToUtc('2026-09-01T10:00:00')).toBe('2026-09-01 13:00:00') })
  it('data com fuso respeita o fuso', () => { expect(erpDateToUtc('2026-09-01T10:00:00-03:00')).toBe('2026-09-01 13:00:00'); expect(erpDateToUtc('2026-09-01T10:00:00Z')).toBe('2026-09-01 10:00:00') })
  it('data inválida vira null', () => { expect(erpDateToUtc('xx')).toBeNull(); expect(erpDateToUtc(undefined)).toBeNull() })
  it('reais viram centavos sem erro de ponto flutuante', () => { expect(cents(19.9)).toBe(1990); expect(cents('1234,56')).toBe(123456); expect(cents(0.1 + 0.2)).toBe(30) })
})

describe('nPessoa', () => {
  it('extrai CNPJ só com dígitos, endereço principal e crédito em centavos', () => {
    const p = nPessoa({ Id: 7, Nome: 'Loja', Cnpj: '11.222.333/0001-81', Whatsapp: '41999990000', LimiteDeCredito: 1500.5, TabelaPrecoPadrao: 2,
      CadastroGeralEndereco: [{ Municipio: 'Itajaí', Estado: 'SC', Principal: false }, { Municipio: 'Curitiba', Estado: 'PR', Principal: true }] })
    expect(p).toMatchObject({ id: 7, cnpj: '11222333000181', city: 'Curitiba', uf: 'PR', creditLimit: 150050, priceTableId: 2 })
  })
  it('rejeita registro sem Id', () => { expect(() => nPessoa({ Nome: 'x' })).toThrow() })
})

describe('nPedido', () => {
  it('lista sem itens → items null; detalhe com itens soma o total se faltar', () => {
    expect(nPedido({ Id: 1, CodDestino: 5, DataMov: '2026-09-01T10:00:00', ValorTotal: 100 }).items).toBeNull()
    const p = nPedido({ Id: 2, CodDestino: 5, DataMov: '2026-09-01T10:00:00', Produto: [{ IdProduto: 9, QtdProduto: 2, ValorUnitario: 10.5 }] })
    expect(p.items).toEqual([{ produtoId: 9, qty: 2, unitPrice: 1050 }]); expect(p.total).toBe(2100)
  })
  it('pedido sem data é erro', () => { expect(() => nPedido({ Id: 1 })).toThrow() })
})

describe('nProduto', () => {
  it('preço por tabela vem das margens; raw não leva imagem nem margem', () => {
    const p = nProduto({ Id: 1, Nome: 'SSD', ProdutoGrade: [{ Principal: true, ProdutoImagem: [{ BinarioArquivo: 'AAAA' }],
      ProdutoMargem: [{ TabelaPrecoId: 1, PrecoComDesconto: 199.9, UltimoCustoEmReal: 120, Margem: 40 }] }] })
    expect(p.precos).toEqual([{ tabelaId: 1, price: 19990, cost: 12000, margin: 40 }])
    expect(JSON.stringify(p.raw)).not.toContain('AAAA'); expect(JSON.stringify(p.raw)).not.toContain('UltimoCusto')
  })
  it('extrai as fotos (principal primeiro, ordem do ERP) e ignora entrada sem binário', () => {
    const p = nProduto({ Id: 2, Nome: 'x', ProdutoGrade: [{ Principal: false, ProdutoImagem: [{ OrdemExibicao: 1, BinarioArquivo: 'OUTRA' }] },
      { Principal: true, ProdutoImagem: [{ OrdemExibicao: 2, BinarioArquivo: 'SEGUNDA' }, { OrdemExibicao: 1, BinarioArquivo: 'PRIMEIRA' }, { OrdemExibicao: 3, NomeArquivo: 'sem-binario.jpg' }] }] })
    expect(p.imagens.map(i => i.base64)).toEqual(['SEGUNDA', 'PRIMEIRA', 'OUTRA']); expect(nProduto({ Id: 3, Nome: 'y' }).imagens).toEqual([])
  })
})
