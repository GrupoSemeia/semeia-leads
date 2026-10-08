import { Hono } from 'hono'
import { type App, fail, newId, tenantOf } from '../lib'
import { pushAtivo, endpointValido, chavesValidas, enviarParaAparelhos } from '../push'

/** Notificações no aparelho: cada pessoa liga e desliga as suas. Conta da plataforma (sem empresa) também pode. */
export const push = new Hono<App>()

push.get('/config', async c => {
  const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=?').bind(c.get('session').userId).first<{ n: number }>()
  return c.json({ ativo: pushAtivo(c.env), chavePublica: pushAtivo(c.env) ? c.env.VAPID_PUBLIC_KEY : null, aparelhos: n?.n ?? 0 })
})

push.post('/inscrever', async c => {
  if (!pushAtivo(c.env)) throw fail(503, 'As notificações no aparelho ainda não foram ativadas neste servidor.')
  const b = await c.req.json<any>().catch(() => ({})), s = c.get('session'), db = c.env.DB
  const e = b.endpoint, p256dh = b.chaves?.p256dh, auth = b.chaves?.auth
  if (!endpointValido(e) || !chavesValidas(p256dh, auth)) throw fail(400, 'Este navegador enviou uma inscrição inválida.')
  const n = await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id=? AND endpoint<>?').bind(s.userId, e).first<{ n: number }>()
  if ((n?.n ?? 0) >= 10) throw fail(400, 'Você já ligou as notificações em 10 aparelhos. Desligue algum antes.')
  await db.prepare(`INSERT INTO push_subscriptions (id, tenant_id, user_id, endpoint, p256dh, auth) VALUES (?,?,?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, tenant_id=excluded.tenant_id, p256dh=excluded.p256dh, auth=excluded.auth`)
    .bind(newId(), tenantOf(c) || null, s.userId, e, p256dh, auth).run()
  return c.json({ ok: true })
})

push.post('/desinscrever', async c => {
  const b = await c.req.json<any>().catch(() => ({}))
  if (typeof b.endpoint !== 'string') throw fail(400, 'Informe o aparelho.')
  await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?').bind(b.endpoint, c.get('session').userId).run()
  return c.json({ ok: true })
})

/** Manda uma notificação de teste para os aparelhos da própria pessoa. */
push.post('/teste', async c => {
  if (!pushAtivo(c.env)) throw fail(503, 'As notificações no aparelho ainda não foram ativadas neste servidor.')
  const aps = await c.env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?').bind(c.get('session').userId).all<any>()
  if (!aps.results.length) throw fail(400, 'Ligue as notificações neste aparelho primeiro.')
  const r = await enviarParaAparelhos(c.env, aps.results, { titulo: 'Semeia Leads', corpo: 'Tudo certo: as notificações estão funcionando neste aparelho.', url: '/' })
  return c.json(r)
})
