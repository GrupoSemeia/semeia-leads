import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail, audit } from '../lib'
import { runSlice } from '../sync/engine'
import { JOBS, type JobName } from '../sync/tasks'

export const sync = new Hono<App>()
sync.use('*', requireRole('manager'))

/** Painel: estado de cada job, últimas execuções e contagens do espelho. Nunca devolve custo/margem. */
sync.get('/', async c => {
  const db = c.env.DB, t = tenantOf(c)
  const [states, runs, counts] = await Promise.all([
    db.prepare('SELECT job, status, cursor, last_ok_at, last_error FROM sync_state WHERE tenant_id=?').bind(t).all<any>(),
    db.prepare('SELECT job, started_at, finished_at, ok, stats, error FROM sync_runs WHERE tenant_id=? ORDER BY started_at DESC LIMIT 10').bind(t).all<any>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM rein_pessoas WHERE tenant_id=?1 AND deleted_at IS NULL) AS clientes,
      (SELECT COUNT(*) FROM rein_produtos WHERE tenant_id=?1 AND deleted_at IS NULL) AS produtos,
      (SELECT COUNT(*) FROM rein_usuarios WHERE tenant_id=?1 AND deleted_at IS NULL) AS vendedores,
      (SELECT COUNT(*) FROM rein_pedidos WHERE tenant_id=?1) AS pedidos,
      (SELECT COUNT(*) FROM rein_pedidos WHERE tenant_id=?1 AND items_synced=0 AND cancelled=0) AS pedidosSemItens,
      (SELECT MAX(ordered_at) FROM rein_pedidos WHERE tenant_id=?1) AS ultimoPedido`).bind(t).first<any>(),
  ])
  return c.json({
    jobs: JOBS.map(j => { const s = states.results.find((x: any) => x.job === j); return { job: j, status: s?.status ?? 'idle', ultimoOk: s?.last_ok_at ?? null, erro: s?.last_error ?? null } }),
    execucoes: runs.results.map((r: any) => ({ ...r, stats: r.stats ? JSON.parse(r.stats) : null })),
    contagens: counts,
  })
})

/** Executa UMA fatia do job. O navegador repete a chamada até `done` (cada fatia respeita o limite de chamadas do Worker). */
sync.post('/:job/run', async c => {
  const job = c.req.param('job') as JobName
  if (!JOBS.includes(job)) throw fail(404, 'Job desconhecido.')
  const body = await c.req.json<any>().catch(() => ({}))
  try {
    const p = await runSlice(c.env, tenantOf(c), job, { restart: !!body.reiniciar })
    if (p.done) await audit(c.env.DB, tenantOf(c), c.get('session').userId, 'sync.done', { job, stats: p.stats })
    return c.json(p)
  } catch (e: any) { throw fail(400, e.message) }
})
