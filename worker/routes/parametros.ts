import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail, audit } from '../lib'
import { loadParams, recomputeAccounts } from '../metrics'
import { PARAMS_PADRAO, validarParamsEditaveis } from '../domain/carteira'

/** Regras da carteira que o gestor ajusta (dias de status, frequência de contato, tamanho da agenda). Ao salvar, a carteira é recalculada. */
export const parametros = new Hono<App>()
parametros.use('*', requireRole('manager'))
const editaveis = (p: typeof PARAMS_PADRAO) => ({ ativoDias: p.ativoDias, emRiscoDias: p.emRiscoDias, agendaSize: p.agendaSize, recompraFator: p.recompraFator, freq: p.freq })

parametros.get('/', async c => c.json({ atual: editaveis(await loadParams(c.env.DB, tenantOf(c))), padrao: editaveis(PARAMS_PADRAO) }))
parametros.put('/', async c => {
  const t = tenantOf(c), v = validarParamsEditaveis(await c.req.json().catch(() => null))
  if (!v.ok) throw fail(400, v.erro)
  await c.env.DB.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'params', ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value=excluded.value").bind(t, JSON.stringify(v.params)).run()
  await audit(c.env.DB, t, c.get('session').userId, 'parametros.update', v.params)
  const r = await recomputeAccounts(c.env.DB, t)
  return c.json({ ok: true, recalculados: r.contas })
})
