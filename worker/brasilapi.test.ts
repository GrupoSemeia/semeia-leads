import { describe, it, expect, vi } from 'vitest'
import { consultarCnpj } from './brasilapi'

describe('consultarCnpj', () => {
  it('lê a resposta e chama só a URL fixa com os 14 dígitos', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ razao_social: 'Loja X LTDA', municipio: 'CURITIBA', uf: 'PR' }), { status: 200 }))
    expect(await consultarCnpj('11.222.333/0001-81', f as any)).toMatchObject({ razaoSocial: 'Loja X LTDA', uf: 'PR' })
    expect((f.mock.calls[0] as any)[0]).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181')
  })
  it('não consulta CNPJ inválido nem texto com caminho', async () => {
    const f = vi.fn(); expect(await consultarCnpj('../../etc', f as any)).toBeNull(); expect(await consultarCnpj('123', f as any)).toBeNull(); expect(f).not.toHaveBeenCalled()
  })
  it('erro HTTP, JSON ruim e queda de rede viram null', async () => {
    expect(await consultarCnpj('11222333000181', (async () => new Response('x', { status: 404 })) as any)).toBeNull()
    expect(await consultarCnpj('11222333000181', (async () => new Response('não é json', { status: 200 })) as any)).toBeNull()
    expect(await consultarCnpj('11222333000181', (async () => { throw new Error('rede') }) as any)).toBeNull()
  })
})
