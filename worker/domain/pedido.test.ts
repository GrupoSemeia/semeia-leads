import { describe, it, expect } from 'vitest'
import { validarPedido, totalDe, montarResumo, montarCorpoPedido, mesclarConfig, faltaConfigurar, brl, CONFIG_PEDIDO_VAZIA, MAX_QTD, type Linha, type ConfigPedidoErp } from './pedido'

const linhas: Linha[] = [{ produtoId: 10, nome: 'SSD 480GB', codigo: 'P1', qtd: 3, preco: 19990 }, { produtoId: 11, nome: 'Cabo HDMI', codigo: null, qtd: 10, preco: 1550 }]
const cfg: ConfigPedidoErp = { codOrigem: 1, canalVendaId: 7, codNatureza: '5.102', usoMercadoria: 'REVENDA', indicadorPresenca: 1, codMeioPagamento: 15, prazoDias: 28 }

describe('validarPedido', () => {
  it('aceita linhas boas', () => { expect(validarPedido([{ produtoId: 1, qtd: 2 }, { produtoId: '3', qtd: '4' }])).toEqual({ ok: true, itens: [{ produtoId: 1, qtd: 2 }, { produtoId: 3, qtd: 4 }] }) })
  it('recusa vazio, não-lista e lista enorme', () => {
    expect(validarPedido([])).toMatchObject({ ok: false }); expect(validarPedido(null)).toMatchObject({ ok: false }); expect(validarPedido({})).toMatchObject({ ok: false })
    expect(validarPedido(Array.from({ length: 201 }, (_, i) => ({ produtoId: i + 1, qtd: 1 })))).toMatchObject({ ok: false })
  })
  it('recusa quantidade zero, negativa, decimal, gigante ou texto', () => {
    for (const qtd of [0, -1, 1.5, MAX_QTD + 1, 'abc', null, NaN]) expect(validarPedido([{ produtoId: 1, qtd }])).toMatchObject({ ok: false })
  })
  it('recusa produto inválido e repetido', () => {
    for (const produtoId of [0, -3, 1.2, 'x', null]) expect(validarPedido([{ produtoId, qtd: 1 }])).toMatchObject({ ok: false })
    expect(validarPedido([{ produtoId: 1, qtd: 1 }, { produtoId: 1, qtd: 2 }])).toMatchObject({ ok: false })
  })
})

describe('total e resumo', () => {
  it('soma em centavos sem erro de ponto flutuante', () => { expect(totalDe(linhas)).toBe(3 * 19990 + 10 * 1550); expect(totalDe([{ qtd: 3, preco: 3333 }])).toBe(9999); expect(totalDe([])).toBe(0) })
  it('formata em reais', () => { expect(brl(19990)).toBe('R$ 199,90'); expect(brl(0)).toBe('R$ 0,00') })
  it('resumo traz cliente, itens, total e observação', () => {
    const r = montarResumo({ empresa: 'AC3', cliente: 'Loja X', vendedor: 'Ana', linhas, observacao: 'entregar sexta' })
    expect(r).toContain('Pedido para Loja X'); expect(r).toContain('3x SSD 480GB (P1) — R$ 199,90 = R$ 599,70'); expect(r).toContain('10x Cabo HDMI — R$ 15,50 = R$ 155,00'); expect(r).toContain('Total: R$ 754,70'); expect(r).toContain('Obs.: entregar sexta')
    expect(montarResumo({ empresa: 'a', cliente: 'b', vendedor: 'c', linhas })).not.toContain('Obs.')
  })
})

describe('configuração do pedido no ERP', () => {
  it('mesclarConfig ignora lixo', () => {
    expect(mesclarConfig(null)).toEqual(CONFIG_PEDIDO_VAZIA)
    expect(mesclarConfig({ codOrigem: '2', canalVendaId: 'x', codNatureza: ' 5.102 ', prazoDias: -3, codMeioPagamento: 1.5 })).toMatchObject({ codOrigem: 2, canalVendaId: null, codNatureza: '5.102', prazoDias: 28, codMeioPagamento: null })
  })
  it('lista o que falta', () => {
    expect(faltaConfigurar(CONFIG_PEDIDO_VAZIA, null)).toHaveLength(7); expect(faltaConfigurar(cfg, 5)).toEqual([]); expect(faltaConfigurar(cfg, null)).toEqual(['ligação do vendedor com o ERP (Equipe)'])
  })
})

describe('montarCorpoPedido', () => {
  const base = { pessoaId: 1000, tabelaPrecoId: 2, vendedorReinId: 5, linhas, hoje: '2026-10-07' }
  it('monta o corpo da Rein com valores em reais e vencimento pelo prazo', () => {
    const r = montarCorpoPedido(base, cfg)
    expect(r.ok).toBe(true); if (!r.ok) return
    expect(r.corpo).toMatchObject({ CodOrigem: 1, CodDestino: 1000, CodVendedor: 5, CanalVendaId: 7, CodNatureza: '5.102', IndicadorPresenca: 1 })
    expect(r.corpo.Produto[0]).toEqual({ IdProduto: 10, CodProduto: 'P1', CodTabelaPreco: 2, QtdProduto: 3, ValorUnitario: 199.9 }); expect(r.corpo.Produto[1].CodProduto).toBe('')
    expect(r.corpo.Pagamento).toEqual([{ ParcelaId: 1, CodMeioPagamento: 15, ValorPagamento: 754.7, DataPagamento: '2026-11-04' }])
  })
  it('recusa quando falta configuração ou o pedido está vazio', () => {
    expect(montarCorpoPedido(base, CONFIG_PEDIDO_VAZIA)).toMatchObject({ ok: false }); expect(montarCorpoPedido({ ...base, vendedorReinId: null }, cfg)).toMatchObject({ ok: false })
    expect(montarCorpoPedido({ ...base, linhas: [] }, cfg)).toMatchObject({ ok: false })
  })
})
