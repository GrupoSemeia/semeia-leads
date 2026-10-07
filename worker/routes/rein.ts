import { Hono } from 'hono'
import { type App, type Env, tenantOf, requireRole, clean, fail, encryptSecret, decryptSecret, audit } from '../lib'
import { reinPing, type ReinCredentials } from '../rein/client'
import { mesclarConfig } from '../domain/pedido'
import { mesclarConfigPessoa } from '../domain/leads'

export const rein = new Hono<App>()
rein.use('*', requireRole('manager'))

/** Credenciais de uma empresa, já descriptografadas. Só uso interno do Worker. */
export async function loadReinCreds(env: Env, tenantId: string): Promise<(ReinCredentials & { mock: boolean }) | null> {
  const r = await env.DB.prepare('SELECT * FROM tenant_rein WHERE tenant_id = ?').bind(tenantId).first<any>()
  if (!r) return null
  return { baseUrl: r.base_url, clientId: r.client_id, database: r.database, signIncludeQuery: !!r.sign_include_query, mock: !!r.mock,
    clientSecret: r.client_secret_enc ? await decryptSecret(env, r.client_secret_enc) : '' }
}

// O segredo nunca volta ao navegador: só dizemos se está configurado.
rein.get('/', async c => {
  const r = await c.env.DB.prepare('SELECT * FROM tenant_rein WHERE tenant_id = ?').bind(tenantOf(c)).first<any>()
  if (!r) return c.json({})
  return c.json({ baseUrl: r.base_url, clientId: r.client_id, database: r.database, segredoConfigurado: !!r.client_secret_enc,
    mock: !!r.mock, assinarComQuery: !!r.sign_include_query, escritaPessoa: !!r.pessoa_write_enabled, escritaPedido: !!r.pedido_write_enabled, atualizadoEm: r.updated_at })
})

rein.put('/', async c => {
  const t = tenantOf(c), b = await c.req.json<any>(), db = c.env.DB
  const baseUrl = clean(b.baseUrl, 200) || 'https://api.rein.net.br'
  if (!/^https:\/\//.test(baseUrl)) throw fail(400, 'O endereço da API precisa começar com https://')
  const cur = await db.prepare('SELECT client_secret_enc FROM tenant_rein WHERE tenant_id = ?').bind(t).first<any>()
  const secretEnc = b.clientSecret ? await encryptSecret(c.env, String(b.clientSecret)) : (cur?.client_secret_enc ?? '')
  await db.prepare(
    `INSERT INTO tenant_rein (tenant_id, base_url, client_id, client_secret_enc, database, mock, sign_include_query, pessoa_write_enabled, pedido_write_enabled, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(tenant_id) DO UPDATE SET base_url=excluded.base_url, client_id=excluded.client_id, client_secret_enc=excluded.client_secret_enc, database=excluded.database,
       mock=excluded.mock, sign_include_query=excluded.sign_include_query, pessoa_write_enabled=excluded.pessoa_write_enabled, pedido_write_enabled=excluded.pedido_write_enabled, updated_at=datetime('now')`)
    .bind(t, baseUrl, clean(b.clientId, 120), secretEnc, clean(b.database, 120), b.mock === false ? 0 : 1, b.assinarComQuery ? 1 : 0, b.escritaPessoa ? 1 : 0, b.escritaPedido ? 1 : 0).run()
  await audit(db, t, c.get('session').userId, 'rein.update', { mock: b.mock !== false, escritaPedido: !!b.escritaPedido })   // nunca o segredo
  return c.json({ ok: true })
})

rein.post('/test', async c => {
  const creds = await loadReinCreds(c.env, tenantOf(c))
  if (!creds) throw fail(404, 'Configure a conexão primeiro.')
  if (creds.mock) return c.json({ ok: true, mock: true, mensagem: 'Modo de teste ligado: usando dados de exemplo, sem falar com o ERP.' })
  if (!creds.clientId || !creds.clientSecret || !creds.database) throw fail(400, 'Preencha ClientId, ClientSecret e Database.')
  try { await reinPing(creds) } catch (e: any) { throw fail(502, `Não consegui conectar ao ERP: ${e.message}`) }
  return c.json({ ok: true, mock: false, mensagem: 'Conexão com o ERP funcionando.' })
})

/** Valores que o ERP exige para criar pedido (natureza, uso, presença, pagamento…). ⚠️ VALIDAR com a Rein antes de ligar a escrita. */
rein.get('/pedido', async c => {
  const r = await c.env.DB.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='pedido_erp'").bind(tenantOf(c)).first<{ value: string }>()
  try { return c.json(mesclarConfig(r ? JSON.parse(r.value) : null)) } catch { return c.json(mesclarConfig(null)) }
})
rein.put('/pedido', async c => {
  const t = tenantOf(c), cfg = mesclarConfig(await c.req.json())
  await c.env.DB.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'pedido_erp', ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value=excluded.value").bind(t, JSON.stringify(cfg)).run()
  await audit(c.env.DB, t, c.get('session').userId, 'rein.pedido_config', cfg)
  return c.json(cfg)
})

/** Tipo de cliente "Prospect" do ERP, usado ao cadastrar lead como pessoa. ⚠️ VALIDAR o id com a Rein. */
rein.get('/pessoa', async c => {
  const r = await c.env.DB.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='pessoa_erp'").bind(tenantOf(c)).first<{ value: string }>()
  try { return c.json(mesclarConfigPessoa(r ? JSON.parse(r.value) : null)) } catch { return c.json(mesclarConfigPessoa(null)) }
})
rein.put('/pessoa', async c => {
  const t = tenantOf(c), cfg = mesclarConfigPessoa(await c.req.json())
  await c.env.DB.prepare("INSERT INTO settings (tenant_id, key, value) VALUES (?, 'pessoa_erp', ?) ON CONFLICT(tenant_id, key) DO UPDATE SET value=excluded.value").bind(t, JSON.stringify(cfg)).run()
  await audit(c.env.DB, t, c.get('session').userId, 'rein.pessoa_config', cfg)
  return c.json(cfg)
})
