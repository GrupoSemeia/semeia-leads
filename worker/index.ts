import { Hono } from 'hono'
import { type App, type Env, AppError, requireLogin, requireNivel } from './lib'
import { auth } from './routes/auth'
import { team } from './routes/team'
import { rein } from './routes/rein'
import { sync } from './routes/sync'
import { accounts } from './routes/accounts'
import { admin } from './routes/admin'
import { agenda, templates } from './routes/agenda'
import { publico } from './routes/publico'
import { catalogo } from './routes/catalogo'
import { prepedidos } from './routes/prepedidos'
import { leads } from './routes/leads'
import { painel } from './routes/painel'
import { parametros } from './routes/parametros'
import { runScheduled } from './sync/engine'

export const app = new Hono<App>()

app.onError((e, c) => {
  if (e instanceof AppError) return c.json({ erro: e.message }, e.status as any)
  if (e instanceof SyntaxError) return c.json({ erro: 'Dados enviados em formato inválido.' }, 400)
  console.error(e)
  return c.json({ erro: 'Erro inesperado. Tente de novo em instantes.' }, 500)
})

app.route('/api/auth', auth)
app.route('/api/publico', publico)   // sem login (pesquisa NPS por token)

// daqui para baixo, só com login — cada rota recebe a empresa da sessão
const priv = new Hono<App>()
priv.use('*', requireLogin)
priv.route('/equipe', team)
priv.route('/rein', rein)
priv.route('/sync', sync)
priv.route('/accounts', accounts)
priv.route('/agenda', agenda)
priv.route('/templates', templates)
// Profissional (nível 2) ou acima; no teste grátis tudo vale
priv.use('/catalogo/*', requireNivel(2)); priv.use('/catalogo', requireNivel(2))
priv.use('/pre-pedidos/*', requireNivel(2)); priv.use('/pre-pedidos', requireNivel(2))
priv.use('/leads/*', requireNivel(2)); priv.use('/leads', requireNivel(2))
priv.route('/leads', leads)
priv.use('/painel/*', requireNivel(3)); priv.use('/painel', requireNivel(3))
priv.route('/painel', painel)
priv.route('/parametros', parametros)
priv.route('/catalogo', catalogo)
priv.route('/pre-pedidos', prepedidos)
priv.route('/admin', admin)   // plataforma (Grupo Semeia): só ADMINS
app.route('/api', priv)

app.all('/api/*', c => c.json({ erro: 'Rota não encontrada.' }, 404))
app.all('*', c => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  // a cada 15 min: continua syncs pela metade e roda os vencidos (pedidos a cada 15 min, cadastros às 02h de Brasília)
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runScheduled(env)) },
} satisfies ExportedHandler<Env>
