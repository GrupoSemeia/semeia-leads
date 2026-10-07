/** Envio de e-mail. Provedor: Resend (RESEND_API_KEY + EMAIL_FROM). Sem chave, fica DESLIGADO e nada é enviado nem logado. EMAIL_PROVIDER=console só para desenvolvimento. */
import type { Env } from './lib'
import { emailValido, assuntoSeguro, type Mensagem } from './domain/emails'

export type ResultadoEmail = { ok: true } | { ok: false; motivo: 'desligado' | 'invalido' | 'erro'; detalhe?: string }
export const emailAtivo = (env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM' | 'EMAIL_PROVIDER'>) => env.EMAIL_PROVIDER === 'console' || (!!env.RESEND_API_KEY && !!env.EMAIL_FROM)

export async function enviarEmail(env: Pick<Env, 'RESEND_API_KEY' | 'EMAIL_FROM' | 'EMAIL_PROVIDER'>, para: string, msg: Mensagem, f: typeof fetch = fetch): Promise<ResultadoEmail> {
  if (!emailValido(para)) return { ok: false, motivo: 'invalido' }
  if (env.EMAIL_PROVIDER === 'console') { console.log('EMAIL_DEV', JSON.stringify({ para, assunto: msg.assunto, texto: msg.texto })); return { ok: true } }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { ok: false, motivo: 'desligado' }
  try {
    const r = await f('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [para], subject: assuntoSeguro(msg.assunto), text: msg.texto, html: msg.html }),
    })
    if (!r.ok) return { ok: false, motivo: 'erro', detalhe: `HTTP ${r.status}` }
    return { ok: true }
  } catch (e: any) { return { ok: false, motivo: 'erro', detalhe: String(e?.message ?? e).slice(0, 100) } }   // nunca registra o destinatário nem o conteúdo
}
