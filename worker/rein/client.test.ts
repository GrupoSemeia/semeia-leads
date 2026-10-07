import { describe, it, expect } from 'vitest'
import { signRequest } from './client'

const creds = { baseUrl: 'https://api.rein.net.br', clientId: 'cid', clientSecret: 'segredo', database: 'base1' }
const now = () => 1_700_000_000_000

describe('signRequest', () => {
  it('gera o mesmo token para a mesma entrada (vetor fixo)', async () => {
    const h = await signRequest('/api/v1/pessoa', creds, { now })
    expect(h.Timestamp).toBe('1700000300')
    expect(h.Token).toMatch(/^[0-9a-f]{64}$/)
    // HMAC-SHA256("segredo", "/api/v1/pessoa.base1.1700000300")
    expect(h.Token).toBe((await signRequest('/api/v1/pessoa', creds, { now })).Token)
    expect(h.Database).toBe('base1'); expect(h.ClientId).toBe('cid')
  })
  it('ignora a querystring por padrão e inclui quando configurado', async () => {
    const a = await signRequest('/api/v1/pessoa?page=2', creds, { now })
    const b = await signRequest('/api/v1/pessoa', creds, { now })
    const c = await signRequest('/api/v1/pessoa?page=2', { ...creds, signIncludeQuery: true }, { now })
    expect(a.Token).toBe(b.Token); expect(c.Token).not.toBe(b.Token)
  })
  it('limita a validade a 15 minutos', async () => {
    const h = await signRequest('/x', creds, { now, ttlSeconds: 99999 })
    expect(h.Timestamp).toBe(String(1_700_000_000 + 900))
  })
})
