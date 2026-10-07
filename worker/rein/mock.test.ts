import { describe, it, expect } from 'vitest'
import { mockApi, MOCK_PAGE_SIZE } from './mock'

describe('mock da Rein', () => {
  const api = mockApi()
  it('pagina e termina com página vazia', async () => {
    const a = await api.listPessoas(0), b = await api.listPessoas(1), c = await api.listPessoas(2), d = await api.listPessoas(3)
    expect(a.items).toHaveLength(MOCK_PAGE_SIZE); expect(a.ids[0]).not.toBe(b.ids[0]); expect(c.items.length).toBeGreaterThan(0); expect(d.items).toHaveLength(0)
  })
  it('CNPJs são únicos e têm 14 dígitos', async () => {
    const todos = [...(await api.listPessoas(0)).items, ...(await api.listPessoas(1)).items, ...(await api.listPessoas(2)).items]
    expect(new Set(todos.map(p => p.cnpj)).size).toBe(60); expect(todos.every(p => p.cnpj?.length === 14)).toBe(true)
  })
  it('lista de pedidos vem sem itens e o detalhe traz os itens', async () => {
    const l = await api.listPedidosVenda({ de: '2024-10-01', ate: '2026-10-07', page: 0 })
    expect(l.items.length).toBeGreaterThan(0); expect(l.items[0].items).toBeNull()
    const det = await api.getPedido(l.items[0].id)
    expect(det?.items?.length).toBeGreaterThan(0)
  })
  it('é determinístico', async () => { expect((await mockApi().listPessoas(0)).ids).toEqual((await api.listPessoas(0)).ids) })
})
