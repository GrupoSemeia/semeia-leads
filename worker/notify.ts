import type { Env, Role } from './lib'
import { enviarEmail, emailAtivo } from './email'
import type { Mensagem } from './domain/emails'

/**
 * Aviso por e-mail a quem gere a empresa (admin/gestor com "receber avisos" ligado).
 * Nunca derruba a operação que o chamou: qualquer falha só vai para o log (sem endereço de e-mail).
 * `chave` evita repetir o mesmo aviso; `limitePorHora` evita enxurrada (ex.: formulário público atacado).
 */
export async function notificarGestores(env: Env, tenantId: string, o: { chave: string; msg: Mensagem; papeis?: Role[]; limitePorHora?: number }): Promise<void> {
  try {
    if (!emailAtivo(env)) return
    const db = env.DB
    if (o.limitePorHora) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM notifications_sent WHERE tenant_id=? AND dedupe_key LIKE ? AND created_at > datetime('now','-1 hour')")
        .bind(tenantId, `${o.chave.split(':')[0]}:%`).first<{ n: number }>()
      if ((n?.n ?? 0) >= o.limitePorHora) return
    }
    const ins = await db.prepare('INSERT OR IGNORE INTO notifications_sent (tenant_id, dedupe_key) VALUES (?,?)').bind(tenantId, o.chave).run()
    if (!ins.meta.changes) return   // já avisado
    const papeis = o.papeis ?? ['admin', 'manager']
    const dest = await db.prepare(`SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id=? AND m.active=1 AND m.notify_email=1 AND m.role IN (${papeis.map(() => '?').join(',')})`)
      .bind(tenantId, ...papeis).all<{ email: string }>()
    for (const d of dest.results) {
      const r = await enviarEmail(env, d.email, o.msg)
      if (!r.ok) console.warn('aviso por e-mail não enviado', o.chave.split(':')[0], r.motivo)
    }
  } catch (e) { console.error('notificarGestores falhou', o.chave.split(':')[0], e) }
}

/** Link do app para os e-mails (APP_URL; sem ele, sem link). */
export const linkApp = (env: Env, caminho: string) => env.APP_URL ? `${env.APP_URL.replace(/\/+$/, '')}${caminho}` : undefined
