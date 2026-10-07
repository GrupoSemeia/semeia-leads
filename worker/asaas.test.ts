import { describe, it, expect, vi } from 'vitest'
import { chamarAsaas, baseAsaas } from './asaas'

describe('baseAsaas', () => {
  it('chave de teste vai para o sandbox; senão usa ASAAS_URL ou produção', () => {
    expect(baseAsaas({ ASAAS_API_KEY: '$aact_hmlg_abc', ASAAS_URL: 'https://api.asaas.com/v3' })).toBe('https://api-sandbox.asaas.com/v3')
    expect(baseAsaas({ ASAAS_API_KEY: '$aact_prod_abc', ASAAS_URL: 'http://localhost:9000/v3/' })).toBe('http://localhost:9000/v3')
    expect(baseAsaas({})).toBe('https://api.asaas.com/v3')
  })
})
describe('chamarAsaas', () => {
  it('manda a chave no cabeçalho e devolve os dados', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 }))
    expect(await chamarAsaas({ ASAAS_API_KEY: 'k' }, 'POST', 'customers', { name: 'x' }, f as any)).toEqual({ ok: true, dados: { id: 'cus_1' } })
    const [url, init] = f.mock.calls[0] as any; expect(url).toBe('https://api.asaas.com/v3/customers'); expect(init.headers.access_token).toBe('k'); expect(init.method).toBe('POST')
  })
  it('junta as mensagens de erro da Asaas', async () => {
    const f = async () => new Response(JSON.stringify({ errors: [{ description: 'CPF inválido.' }, { description: 'E-mail inválido.' }] }), { status: 400 })
    expect(await chamarAsaas({ ASAAS_API_KEY: 'k' }, 'POST', 'customers', {}, f as any)).toEqual({ ok: false, erro: 'CPF inválido. E-mail inválido.' })
  })
  it('erro sem corpo e queda de rede viram mensagem em português', async () => {
    expect(await chamarAsaas({}, 'GET', 'x', undefined, (async () => new Response('', { status: 500 })) as any)).toEqual({ ok: false, erro: 'Erro 500 na Asaas.' })
    const r = await chamarAsaas({}, 'GET', 'x', undefined, (async () => { throw new Error('rede') }) as any); expect(r.ok).toBe(false)
  })
})
