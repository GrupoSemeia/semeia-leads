import { describe, it, expect, vi } from 'vitest'
import { enviarEmail, emailAtivo } from './email'
const msg = { assunto: 'Oi', texto: 'texto', html: '<p>oi</p>' }

describe('enviarEmail', () => {
  it('sem chave fica desligado e não chama a rede', async () => { const f = vi.fn(); expect(await enviarEmail({}, 'a@b.com', msg, f as any)).toEqual({ ok: false, motivo: 'desligado' }); expect(f).not.toHaveBeenCalled(); expect(emailAtivo({})).toBe(false) })
  it('destinatário inválido nem tenta', async () => { const f = vi.fn(); expect(await enviarEmail({ RESEND_API_KEY: 'k', EMAIL_FROM: 'x <a@b.com>' }, 'a@b.com\nBcc: z@z.com', msg, f as any)).toEqual({ ok: false, motivo: 'invalido' }); expect(f).not.toHaveBeenCalled() })
  it('envia pela Resend com a chave no cabeçalho e um só destinatário', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await enviarEmail({ RESEND_API_KEY: 'k', EMAIL_FROM: 'Semeia <a@b.com>' }, 'ana@x.com', msg, f as any)).toEqual({ ok: true })
    const [url, init] = f.mock.calls[0] as any; expect(url).toBe('https://api.resend.com/emails'); expect(init.headers.authorization).toBe('Bearer k')
    expect(JSON.parse(init.body)).toMatchObject({ from: 'Semeia <a@b.com>', to: ['ana@x.com'], subject: 'Oi' })
  })
  it('erro do provedor e queda de rede viram resultado, sem vazar o destinatário', async () => {
    const r1 = await enviarEmail({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com' }, 'ana@x.com', msg, (async () => new Response('x', { status: 422 })) as any); expect(r1).toEqual({ ok: false, motivo: 'erro', detalhe: 'HTTP 422' })
    const r2 = await enviarEmail({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com' }, 'ana@x.com', msg, (async () => { throw new Error('rede') }) as any); expect(r2.ok).toBe(false); expect(JSON.stringify(r2)).not.toContain('ana@x.com')
  })
  it('modo console (desenvolvimento) conta como ativo', () => { expect(emailAtivo({ EMAIL_PROVIDER: 'console' })).toBe(true); expect(emailAtivo({ RESEND_API_KEY: 'k' })).toBe(false); expect(emailAtivo({ RESEND_API_KEY: 'k', EMAIL_FROM: 'a@b.com' })).toBe(true) })
})
