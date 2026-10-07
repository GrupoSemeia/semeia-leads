import { describe, it, expect, vi, afterEach } from 'vitest'
import { reinFetch } from './client'

const creds = { baseUrl: 'https://rein.test', clientId: 'c', clientSecret: 's', database: 'd' }
afterEach(() => { vi.unstubAllGlobals() })

describe('reinFetch: repetição só em leitura', () => {
  it('GET com erro 500 tenta 3 vezes', async () => {
    const f = vi.fn(async () => new Response('x', { status: 500 })); vi.stubGlobal('fetch', f)
    await expect(reinFetch('GET', '/api/v1/pessoa', creds, undefined, { esperaMs: 1 })).rejects.toThrow(); expect(f).toHaveBeenCalledTimes(3)
  })
  it('PUT com erro 500 tenta UMA vez só (não duplica pedido)', async () => {
    const f = vi.fn(async () => new Response('x', { status: 500 })); vi.stubGlobal('fetch', f)
    await expect(reinFetch('PUT', '/api/v1/pedido', creds, { a: 1 })).rejects.toThrow()
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('PUT com erro de rede também não repete', async () => {
    const f = vi.fn(async () => { throw new TypeError('network') }); vi.stubGlobal('fetch', f)
    await expect(reinFetch('PUT', '/api/v1/pedido', creds, {})).rejects.toThrow(); expect(f).toHaveBeenCalledTimes(1)
  })
  it('GET que dá certo na segunda tentativa devolve o resultado', async () => {
    let n = 0; vi.stubGlobal('fetch', vi.fn(async () => (++n === 1 ? new Response('x', { status: 503 }) : new Response(JSON.stringify([{ Id: 1 }]), { status: 200 }))))
    expect(await reinFetch('GET', '/api/v1/pessoa', creds, undefined, { esperaMs: 1 })).toEqual([{ Id: 1 }])
  })
})
