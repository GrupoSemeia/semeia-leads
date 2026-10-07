import { Hono } from 'hono'
import { type App, type Env, AppError, requireLogin } from './lib'
import { auth } from './routes/auth'
import { team } from './routes/team'
import { rein } from './routes/rein'
import { sync } from './routes/sync'
import { accounts } from './routes/accounts'
import { admin } from './routes/admin'
import { runScheduled } from './sync/engine'

const app = new Hono<App>()

app.onError((e, c) => {
  if (e instanceof AppError) return c.json({ erro: e.message }, e.status as any)
  if (e instanceof SyntaxError) return c.json({ erro: 'Dados enviados em formato inválido.' }, 400)
  console.error(e)
  return c.json({ erro: 'Erro inesperado. Tente de novo em instantes.' }, 500)
})

app.route('/api/auth', auth)

// daqui para baixo, só com login — cada rota recebe a empresa da sessão
const priv = new Hono<App>()
priv.use('*', requireLogin)
priv.route('/equipe', team)
priv.route('/rein', rein)
priv.route('/sync', sync)
priv.route('/accounts', accounts)
priv.route('/admin', admin)   // plataforma (Grupo Semeia): só ADMINS
app.route('/api', priv)

app.all('/api/*', c => c.json({ erro: 'Rota não encontrada.' }, 404))
app.all('*', c => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  // a cada 15 min: continua syncs pela metade e roda os vencidos (pedidos a cada 15 min, cadastros às 02h de Brasília)
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runScheduled(env)) },
} satisfies ExportedHandler<Env>
