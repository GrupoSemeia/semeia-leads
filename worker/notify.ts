import type { Env, Role } from './lib'
import { enviarEmail, emailAtivo } from './email'
import { pushAtivo, enviarParaAparelhos } from './push'
import type { Mensagem } from './domain/emails'

/**
 * Aviso por e-mail a quem gere a empresa (admin/gestor com "receber avisos" ligado).
 * Nunca derruba a operação que o chamou: qualquer falha só vai para o log (sem endereço de e-mail).
 * `chave` evita repetir o mesmo aviso; `limitePorHora` evita enxurrada (ex.: formulário público atacado).
 */
export async function notificarGestores(env: Env, tenantId: string, o: { chave: string; msg: Mensagem; papeis?: Role[]; limitePorHora?: number }): Promise<void> {
  try {
    const comEmail = emailAtivo(env), comPush = pushAtivo(env)
    if (!comEmail && !comPush) return
    const db = env.DB
    if (o.limitePorHora) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM notifications_sent WHERE tenant_id=? AND dedupe_key LIKE ? AND created_at > datetime('now','-1 hour')")
        .bind(tenantId, `${o.chave.split(':')[0]}:%`).first<{ n: number }>()
      if ((n?.n ?? 0) >= o.limitePorHora) return
    }
    const ins = await db.prepare('INSERT OR IGNORE INTO notifications_sent (tenant_id, dedupe_key) VALUES (?,?)').bind(tenantId, o.chave).run()
    if (!ins.meta.changes) return   // já avisado
    const papeis = o.papeis ?? ['admin', 'manager']
    const marcas = papeis.map(() => '?').join(',')
    if (comEmail) {
      const dest = await db.prepare(`SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id=? AND m.active=1 AND m.notify_email=1 AND m.role IN (${marcas})`)
        .bind(tenantId, ...papeis).all<{ email: string }>()
      for (const d of dest.results) {
        const r = await enviarEmail(env, d.email, o.msg)
        if (!r.ok) console.warn('aviso por e-mail não enviado', o.chave.split(':')[0], r.motivo)
      }
    }
    if (comPush) {   // quem ligou as notificações em algum aparelho (e é gestor/admin da empresa) recebe também no aparelho
      const aps = await db.prepare(`SELECT p.id, p.endpoint, p.p256dh, p.auth FROM push_subscriptions p JOIN members m ON m.user_id = p.user_id
          WHERE m.tenant_id=? AND m.active=1 AND m.role IN (${marcas})`).bind(tenantId, ...papeis).all<any>()
      await enviarParaAparelhos(env, aps.results, { titulo: o.msg.assunto, corpo: o.msg.resumo ?? '', url: caminhoDoLink(o.msg.link) })
    }
  } catch (e) { console.error('notificarGestores falhou', o.chave.split(':')[0], e) }
}

/** Link do app para os e-mails (APP_URL; sem ele, sem link). */
export const linkApp = (env: Env, caminho: string) => env.APP_URL ? `${env.APP_URL.replace(/\/+$/, '')}${caminho}` : undefined

/** A notificação abre só um caminho do próprio app (nunca um endereço de fora). */
export function caminhoDoLink(link?: string): string {
  try { if (!link) return '/'; const u = new URL(link); return u.pathname + u.search } catch { return '/' }
}
