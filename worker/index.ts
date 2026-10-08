import { Hono } from 'hono'
import { type App, type Env, AppError, requireLogin, soComEmpresa, requireNivel, readSession } from './lib'
import { auth } from './routes/auth'
import { team } from './routes/team'
import { rein } from './routes/rein'
import { sync } from './routes/sync'
import { accounts } from './routes/accounts'
import { admin } from './routes/admin'
import { push } from './routes/push'
import { agenda, templates } from './routes/agenda'
import { publico } from './routes/publico'
import { catalogo } from './routes/catalogo'
import { prepedidos } from './routes/prepedidos'
import { imagens } from './routes/imagens'
import { leads } from './routes/leads'
import { painel } from './routes/painel'
import { parametros } from './routes/parametros'
import { assinatura, asaasWebhook } from './routes/assinatura'
import { exigirContaLiberada } from './billing'
import { runScheduled } from './sync/engine'

export const app = new Hono<App>()

app.onError((e, c) => {
  if (e instanceof AppError) return c.json({ erro: e.message }, e.status as any)
  if (e instanceof SyntaxError) return c.json({ erro: 'Dados enviados em formato inválido.' }, 400)
  console.error(e)
  return c.json({ erro: 'Erro inesperado. Tente de novo em instantes.' }, 500)
})

app.route('/api/auth', auth)
app.route('/api/publico', publico)
app.route('/api/asaas/webhook', asaasWebhook)   // Asaas: pagamentos dos planos (token no cabeçalho)   // sem login (pesquisa NPS por token)

// daqui para baixo, só com login — cada rota recebe a empresa da sessão
const priv = new Hono<App>()
priv.use('*', requireLogin)
priv.use('*', soComEmpresa)   // conta só da plataforma (sem empresa) fica restrita a /admin e /push
priv.use('*', exigirContaLiberada)   // teste acabou / sem pagamento / suspensa → 402 (dados guardados)
priv.route('/equipe', team)
priv.route('/rein', rein)
priv.route('/sync', sync)
priv.route('/accounts', accounts)
priv.route('/agenda', agenda)
priv.route('/templates', templates)
// Profissional (nível 2) ou acima; no teste grátis tudo vale
priv.use('/catalogo/*', requireNivel(2)); priv.use('/catalogo', requireNivel(2))
priv.use('/imagens/*', requireNivel(2))
priv.route('/imagens', imagens)
priv.use('/pre-pedidos/*', requireNivel(2)); priv.use('/pre-pedidos', requireNivel(2))
priv.use('/leads/*', requireNivel(2)); priv.use('/leads', requireNivel(2))
priv.route('/leads', leads)
priv.use('/painel/*', requireNivel(3)); priv.use('/painel', requireNivel(3))
priv.route('/painel', painel)
priv.route('/assinatura', assinatura)
priv.route('/parametros', parametros)
priv.route('/catalogo', catalogo)
priv.route('/pre-pedidos', prepedidos)
priv.route('/push', push)
priv.route('/admin', admin)   // plataforma (Grupo Semeia): só ADMINS
app.route('/api', priv)

app.all('/api/*', c => c.json({ erro: 'Rota não encontrada.' }, 404))
// Entrada do site: quem não está logado vê a página de apresentação; quem está logado, ou abriu pelo ícone instalado no celular
// (start_url "/?origem=app"), vai direto para o app. A mesma URL muda conforme o login, por isso não pode ficar em cache.
app.get('/', async c => {
  const logado = c.req.query('origem') === 'app' || !!(await readSession(c).catch(() => null))
  const url = new URL(c.req.url); url.pathname = logado ? '/' : '/inicio'; url.search = ''
  const r = await c.env.ASSETS.fetch(new Request(url, c.req.raw))
  const resp = new Response(r.body, r)
  resp.headers.set('cache-control', 'no-store'); resp.headers.append('vary', 'Cookie')
  return resp
})
app.all('*', c => c.env.ASSETS.fetch(c.req.raw))

export default {
  fetch: app.fetch,
  // a cada 15 min: continua syncs pela metade e roda os vencidos (pedidos a cada 15 min, cadastros às 02h de Brasília)
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) { ctx.waitUntil(runScheduled(env)) },
} satisfies ExportedHandler<Env>
