import { describe, it, expect, vi } from 'vitest'
import { notificarGestores } from './notify'

/** D1 falso mínimo: guarda as chaves já avisadas e devolve os destinatários combinados. */
function env(destinos: string[], enviados: number[] = []) {
  const chaves = new Set<string>()
  const db = { prepare: (sql: string) => ({ bind: (...a: any[]) => ({
    run: async () => { if (sql.startsWith('INSERT OR IGNORE')) { const k = String(a[1]); const novo = !chaves.has(k); chaves.add(k); return { meta: { changes: novo ? 1 : 0 } } } return { meta: { changes: 0 } } },
    first: async () => ({ n: [...chaves].filter(k => k.startsWith(String(a[1]).replace('%', ''))).length }),
    all: async () => ({ results: destinos.map(email => ({ email })) }),
  }) }) }
  return { DB: db, EMAIL_PROVIDER: 'console' } as any
}
const msg = { assunto: 'a', texto: 't', html: 'h' }

describe('notificarGestores', () => {
  it('avisa cada destinatário uma vez por chave', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const e = env(['a@x.com', 'b@x.com'])
    await notificarGestores(e, 't1', { chave: 'nps:1', msg })
    await notificarGestores(e, 't1', { chave: 'nps:1', msg })
    expect(log.mock.calls.filter(c => c[0] === 'EMAIL_DEV')).toHaveLength(2)
    log.mockRestore()
  })
  it('respeita o limite por hora do mesmo tipo de aviso', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const e = env(['a@x.com'])
    for (const i of [1, 2, 3, 4]) await notificarGestores(e, 't1', { chave: `lead:${i}`, msg, limitePorHora: 2 })
    expect(log.mock.calls.filter(c => c[0] === 'EMAIL_DEV')).toHaveLength(2)
    log.mockRestore()
  })
  it('com e-mail desligado não faz nada nem falha', async () => {
    await expect(notificarGestores({ DB: {} } as any, 't1', { chave: 'x:1', msg })).resolves.toBeUndefined()
  })
})
