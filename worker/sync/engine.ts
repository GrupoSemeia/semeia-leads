/**
 * Motor do sync Rein → espelho local (D1). Retomável: cada chamada a `runSlice` faz no máximo
 * MAX_CALLS chamadas à Rein (limite de subrequests do Worker) e guarda o cursor em `sync_state`.
 * Quem chama (rota manual ou cron) repete até `done`.
 * Regra de ouro: tudo filtrado por tenant_id, que vem de quem chama (sessão ou iteração do cron), nunca de dado externo.
 */
import type { Env } from '../lib'
import { newId } from '../lib'
import { loadReinCreds } from '../routes/rein'
import { recomputeAccounts } from '../metrics'
import { generateTasks } from '../tasks'
import { reinApiFor, type ReinApi } from '../rein/api'
import type { Pedido } from '../rein/normalize'
import { type JobName, type Task, tasksFor, rotuloTarefa } from './tasks'

export const MAX_CALLS = 25          // chamadas à Rein por fatia
const MAX_MS = 20_000                // e tempo por fatia
const LEASE_MS = 2 * 60_000
const BATCH = 80                     // comandos por db.batch
const MAX_PAGES = 2000               // trava de segurança contra paginação infinita
const DETALHES_POR_CHAMADA = 2       // concorrência máxima com a Rein: 2

type Stats = Record<string, number>
type Cursor = { i: number; page: number; start: string; startedAt: string; firstId: number | null; stats: Stats }
export type Progress = { job: JobName; status: 'idle' | 'running'; done: boolean; etapa: string; passo: number; passos: number; stats: Stats; erro?: string }

const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
/** dia local do ERP (Brasília) */
const hojeLocal = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)

async function chunked(db: D1Database, stmts: D1PreparedStatement[]) {
  for (let i = 0; i < stmts.length; i += BATCH) await db.batch(stmts.slice(i, i + BATCH))
}

/* ---------- upserts do espelho ---------- */
const SEEN = 'synced_at=excluded.synced_at, missing_count=0, deleted_at=NULL'
async function saveResource(db: D1Database, tenant: string, name: string, items: any[], at: string) {
  const b = (sql: string, ...v: unknown[]) => db.prepare(sql).bind(...v)
  const stmts: D1PreparedStatement[] = []
  for (const it of items) {
    switch (name) {
      case 'usuarios': stmts.push(b(`INSERT INTO rein_usuarios (tenant_id, rein_id, name, raw, synced_at) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, raw=excluded.raw, ${SEEN}`, tenant, it.id, it.name, JSON.stringify(it.raw), at)); break
      case 'tabelas': stmts.push(b(`INSERT INTO rein_tabelas_preco (tenant_id, rein_id, name, synced_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, ${SEEN}`, tenant, it.id, it.name, at)); break
      case 'categorias': stmts.push(b(`INSERT INTO rein_categorias (tenant_id, rein_id, name, parent_id, synced_at) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, parent_id=excluded.parent_id, ${SEEN}`, tenant, it.id, it.name, it.parentId, at)); break
      case 'marcas': stmts.push(b(`INSERT INTO rein_marcas (tenant_id, rein_id, name, synced_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, ${SEEN}`, tenant, it.id, it.name, at)); break
      case 'produtos':
        stmts.push(b(`INSERT INTO rein_produtos (tenant_id, rein_id, name, code, sku, brand_id, category_ids, active, is_service, modified_at, raw, synced_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, code=excluded.code, sku=excluded.sku, brand_id=excluded.brand_id, category_ids=excluded.category_ids, active=excluded.active,
          is_service=excluded.is_service, modified_at=excluded.modified_at, raw=excluded.raw, ${SEEN}`,
          tenant, it.id, it.name, it.code, it.sku, it.brandId, JSON.stringify(it.categoryIds), it.active ? 1 : 0, it.isService ? 1 : 0, it.modifiedAt, JSON.stringify(it.raw), at))
        for (const p of it.precos) stmts.push(b(`INSERT INTO rein_precos (tenant_id, produto_rein_id, tabela_rein_id, price, cost, margin) VALUES (?,?,?,?,?,?)
          ON CONFLICT(tenant_id, produto_rein_id, tabela_rein_id) DO UPDATE SET price=excluded.price, cost=excluded.cost, margin=excluded.margin`, tenant, it.id, p.tabelaId, p.price, p.cost, p.margin))
        break
      case 'pessoas': stmts.push(b(`INSERT INTO rein_pessoas (tenant_id, rein_id, name, legal_name, cnpj, cnae, whatsapp, phone, email, city, uf, price_table_id, credit_limit, sales_channel_id, registered_at, modified_at, raw, synced_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET name=excluded.name, legal_name=excluded.legal_name, cnpj=excluded.cnpj, cnae=excluded.cnae, whatsapp=excluded.whatsapp,
          phone=excluded.phone, email=excluded.email, city=excluded.city, uf=excluded.uf, price_table_id=excluded.price_table_id, credit_limit=excluded.credit_limit, sales_channel_id=excluded.sales_channel_id,
          registered_at=excluded.registered_at, modified_at=excluded.modified_at, raw=excluded.raw, ${SEEN}`,
          tenant, it.id, it.name, it.legalName, it.cnpj, it.cnae, it.whatsapp, it.phone, it.email, it.city, it.uf, it.priceTableId, it.creditLimit, it.channelId, it.registeredAt, it.modifiedAt, JSON.stringify(it.raw), at)); break
    }
  }
  await chunked(db, stmts)
}
const TABELA_DO: Record<string, string> = { usuarios: 'rein_usuarios', tabelas: 'rein_tabelas_preco', categorias: 'rein_categorias', marcas: 'rein_marcas', produtos: 'rein_produtos', pessoas: 'rein_pessoas' }

async function savePedidos(db: D1Database, tenant: string, peds: Pedido[], at: string): Promise<number> {
  const stmts: D1PreparedStatement[] = []
  let itens = 0
  for (const p of peds) {
    stmts.push(db.prepare(`INSERT INTO rein_pedidos (tenant_id, rein_id, pessoa_rein_id, vendedor_rein_id, sales_channel_id, ordered_at, total, finalized, cancelled, items_synced, raw, synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id, rein_id) DO UPDATE SET pessoa_rein_id=excluded.pessoa_rein_id, vendedor_rein_id=excluded.vendedor_rein_id, sales_channel_id=excluded.sales_channel_id,
      ordered_at=excluded.ordered_at, total=excluded.total, finalized=excluded.finalized, cancelled=excluded.cancelled,
      items_synced=CASE WHEN excluded.items_synced=1 THEN 1 ELSE MIN(items_synced, 1) END, raw=excluded.raw, synced_at=excluded.synced_at`)
      .bind(tenant, p.id, p.pessoaId, p.vendedorId, p.channelId, p.orderedAt, p.total, p.finalized === null ? null : p.finalized ? 1 : 0, p.cancelled ? 1 : 0, p.items ? 1 : 0, JSON.stringify(p.raw), at))
    if (p.items) { stmts.push(...itensStmts(db, tenant, p.id, p.items)); itens += p.items.length }
  }
  await chunked(db, stmts)
  return itens
}
const itensStmts = (db: D1Database, tenant: string, pedidoId: number, items: NonNullable<Pedido['items']>) => [
  db.prepare('DELETE FROM rein_pedido_itens WHERE tenant_id=? AND pedido_rein_id=?').bind(tenant, pedidoId),
  ...items.map((x, line) => db.prepare('INSERT INTO rein_pedido_itens (tenant_id, pedido_rein_id, line, produto_rein_id, qty, unit_price) VALUES (?,?,?,?,?,?)').bind(tenant, pedidoId, line, x.produtoId, x.qty, x.unitPrice)),
]

/* ---------- execução de uma tarefa (uma página por vez) ---------- */
type Step = { finished: boolean; calls: number }
async function runPage(env: Env, api: ReinApi, tenant: string, task: Task, cur: Cursor, calls: number): Promise<Step> {
  const db = env.DB
  if (task.kind === 'detalhes') {
    const pend = await db.prepare('SELECT rein_id FROM rein_pedidos WHERE tenant_id=? AND items_synced=0 AND cancelled=0 ORDER BY ordered_at DESC LIMIT ?').bind(tenant, Math.max(1, Math.min(calls, 12)) * DETALHES_POR_CHAMADA).all<{ rein_id: number }>()
    if (!pend.results.length) return { finished: true, calls: 0 }
    let used = 0
    for (let i = 0; i < pend.results.length; i += DETALHES_POR_CHAMADA) {
      const grupo = pend.results.slice(i, i + DETALHES_POR_CHAMADA)
      const got = await Promise.all(grupo.map(g => api.getPedido(g.rein_id)))
      used += grupo.length
      const stmts: D1PreparedStatement[] = []
      got.forEach((p, k) => {
        const id = grupo[k].rein_id
        if (!p) { stmts.push(db.prepare('UPDATE rein_pedidos SET items_synced=2 WHERE tenant_id=? AND rein_id=?').bind(tenant, id)); return }   // sumiu do ERP: não tentar de novo
        stmts.push(db.prepare('UPDATE rein_pedidos SET items_synced=1, total=?, finalized=COALESCE(?, finalized), cancelled=? WHERE tenant_id=? AND rein_id=?')
          .bind(p.total, p.finalized === null ? null : p.finalized ? 1 : 0, p.cancelled ? 1 : 0, tenant, id), ...itensStmts(db, tenant, id, p.items ?? []))
        cur.stats.itens = (cur.stats.itens ?? 0) + (p.items?.length ?? 0)
      })
      await chunked(db, stmts)
      cur.stats.detalhes = (cur.stats.detalhes ?? 0) + grupo.length
    }
    return { finished: false, calls: used }   // volta a olhar a fila; termina quando não houver pendentes
  }

  if (cur.page > MAX_PAGES) throw new Error('Paginação não terminou (mais de 2000 páginas). Confira a resposta da Rein.')
  const page = task.kind === 'resource'
    ? await ({ usuarios: () => api.listUsuarios(cur.page), tabelas: () => api.listTabelasPreco(cur.page), categorias: () => api.listCategorias(cur.page),
        marcas: () => api.listMarcas(cur.page), produtos: () => api.listProdutos(cur.page), pessoas: () => api.listPessoas(cur.page) } as const)[task.name]()
    : await api.listPedidosVenda({ de: task.de, ate: task.ate, page: cur.page })
  // fim da lista: página vazia, ou página repetida (a Rein ignorou o parâmetro de página)
  if (!page.items.length || (cur.page > 0 && page.ids[0] === cur.firstId)) return { finished: true, calls: 1 }
  if (cur.page === 0) cur.firstId = page.ids[0]
  if (task.kind === 'resource') {
    await saveResource(db, tenant, task.name, page.items, cur.startedAt)
    cur.stats[task.name] = (cur.stats[task.name] ?? 0) + page.items.length
  } else {
    const itens = await savePedidos(db, tenant, page.items as Pedido[], cur.startedAt)
    cur.stats.pedidos = (cur.stats.pedidos ?? 0) + page.items.length
    cur.stats.itens = (cur.stats.itens ?? 0) + itens
  }
  cur.page++
  return { finished: false, calls: 1 }
}

/** Registros que sumiram do ERP: +1 na contagem; só viram "apagados" após 2 sincronizações completas sem aparecer. */
async function markMissing(db: D1Database, tenant: string, startedAt: string, resources: string[]) {
  const now = nowUtc()
  await chunked(db, resources.map(r => db.prepare(
    `UPDATE ${TABELA_DO[r]} SET missing_count = missing_count + 1, deleted_at = CASE WHEN missing_count + 1 >= 2 THEN ? ELSE deleted_at END
      WHERE tenant_id = ? AND synced_at < ? AND deleted_at IS NULL`).bind(now, tenant, startedAt)))
}

/* ---------- controle do job ---------- */
async function getState(db: D1Database, tenant: string, job: JobName) {
  await db.prepare('INSERT OR IGNORE INTO sync_state (tenant_id, job) VALUES (?,?)').bind(tenant, job).run()
  return (await db.prepare('SELECT * FROM sync_state WHERE tenant_id=? AND job=?').bind(tenant, job).first<any>())!
}
const progressOf = (job: JobName, status: 'idle' | 'running', cur: Cursor, tasks: Task[], done: boolean, erro?: string): Progress => ({
  job, status, done, etapa: done ? 'Concluído' : rotuloTarefa(tasks[Math.min(cur.i, tasks.length - 1)]), passo: Math.min(cur.i, tasks.length), passos: tasks.length, stats: cur.stats, erro })

/** Começa um job (ou continua o que está em andamento) e executa uma fatia. */
export async function runSlice(env: Env, tenant: string, job: JobName, opts: { restart?: boolean } = {}): Promise<Progress> {
  const db = env.DB, t0 = Date.now()
  const creds = await loadReinCreds(env, tenant)
  if (!creds) throw new Error('Configure a conexão com o ERP primeiro.')
  if (!creds.mock && (!creds.clientId || !creds.clientSecret || !creds.database)) throw new Error('Preencha as credenciais do ERP ou ligue o modo de teste.')

  const st = await getState(db, tenant, job)
  // trava: só uma fatia por vez para a mesma empresa/job
  const claimed = await db.prepare('UPDATE sync_state SET lease_until=? WHERE tenant_id=? AND job=? AND (lease_until IS NULL OR lease_until < ?)')
    .bind(new Date(t0 + LEASE_MS).toISOString(), tenant, job, new Date(t0).toISOString()).run()
  if (!claimed.meta.changes) {
    const cur0: Cursor = st.cursor ? JSON.parse(st.cursor) : { i: 0, page: 0, start: hojeLocal(), startedAt: nowUtc(), firstId: null, stats: {} }
    return progressOf(job, st.status, cur0, tasksFor(job, cur0.start), false)   // outra fatia em andamento
  }

  let cur: Cursor, runId: string = st.run_id
  if (st.status !== 'running' || opts.restart || !st.cursor) {
    cur = { i: 0, page: 0, start: hojeLocal(), startedAt: nowUtc(), firstId: null, stats: {} }
    runId = newId()
    await db.prepare("INSERT INTO sync_runs (id, tenant_id, job) VALUES (?,?,?)").bind(runId, tenant, job).run()
    await db.prepare("UPDATE sync_state SET status='running', run_id=?, last_error=NULL WHERE tenant_id=? AND job=?").bind(runId, tenant, job).run()
  } else cur = JSON.parse(st.cursor)

  const tasks = tasksFor(job, cur.start), api = reinApiFor(creds)
  let done = false, erro: string | undefined, calls = MAX_CALLS
  try {
    while (calls > 0 && Date.now() - t0 < MAX_MS) {
      if (cur.i >= tasks.length) { done = true; break }
      const r = await runPage(env, api, tenant, tasks[cur.i], cur, calls)
      calls -= Math.max(r.calls, 1)
      if (r.finished) { cur.i++; cur.page = 0; cur.firstId = null }
    }
    if (cur.i >= tasks.length) done = true
  } catch (e: any) {
    erro = String(e?.message ?? e).slice(0, 500)
  }

  if (erro) {
    await db.prepare("UPDATE sync_state SET status='idle', cursor=?, lease_until=NULL, last_error=? WHERE tenant_id=? AND job=?").bind(JSON.stringify(cur), erro, tenant, job).run()
    await db.prepare("UPDATE sync_runs SET finished_at=datetime('now'), ok=0, stats=?, error=? WHERE id=?").bind(JSON.stringify(cur.stats), erro, runId).run()
    return progressOf(job, 'idle', cur, tasks, false, erro)
  }
  if (done) {
    // cadastros completos (sozinhos ou dentro da carga inicial) permitem detectar o que sumiu do ERP
    if (job !== 'pedidos') await markMissing(db, tenant, cur.startedAt, ['usuarios', 'tabelas', 'categorias', 'marcas', 'produtos', 'pessoas'])
    // pedidos/cadastros novos mudam curva, status e prioridade: recalcula a carteira
    try { cur.stats.contas = (await recomputeAccounts(db, tenant)).contas; cur.stats.tarefas = await generateTasks(db, tenant) } catch (e) { console.error('recompute falhou', tenant, e) }
    await db.prepare("UPDATE sync_state SET status='idle', cursor=NULL, lease_until=NULL, last_ok_at=datetime('now'), last_error=NULL WHERE tenant_id=? AND job=?").bind(tenant, job).run()
    await db.prepare("UPDATE sync_runs SET finished_at=datetime('now'), ok=1, stats=? WHERE id=?").bind(JSON.stringify(cur.stats), runId).run()
    return progressOf(job, 'idle', cur, tasks, true)
  }
  await db.prepare('UPDATE sync_state SET cursor=?, lease_until=NULL WHERE tenant_id=? AND job=?').bind(JSON.stringify(cur), tenant, job).run()
  await db.prepare('UPDATE sync_runs SET stats=? WHERE id=?').bind(JSON.stringify(cur.stats), runId).run()
  return progressOf(job, 'running', cur, tasks, false)
}

/** Cron (a cada 15 min): continua o que está pela metade e dispara os jobs vencidos das empresas com ERP real configurado. */
export async function runScheduled(env: Env) {
  const db = env.DB, now = new Date()
  const rows = await db.prepare(
    `SELECT tr.tenant_id, tr.mock, tr.client_id, tr.database FROM tenant_rein tr JOIN tenants t ON t.id = tr.tenant_id WHERE t.plan IN ('trial','ativo')`).all<any>()
  for (const r of rows.results) {
    const tenant = r.tenant_id as string
    try {
      const states = await db.prepare('SELECT job, status, last_ok_at FROM sync_state WHERE tenant_id=?').bind(tenant).all<any>()
      const by = Object.fromEntries(states.results.map((s: any) => [s.job, s]))
      const emAndamento = JOBS_RESUMIVEIS.filter(j => by[j]?.status === 'running')
      const real = !r.mock && r.client_id && r.database
      const vencido = (j: JobName, minutos: number) => !by[j]?.last_ok_at || now.getTime() - new Date(by[j].last_ok_at.replace(' ', 'T') + 'Z').getTime() > minutos * 60_000
      const jobs = new Set<JobName>(emAndamento)
      // a carga inicial (backfill) é sempre manual; só depois dela o sync automático passa a rodar
      if (real && by.backfill?.last_ok_at) {
        if (vencido('pedidos', 14)) jobs.add('pedidos')
        if (now.getUTCHours() === 5 && vencido('cadastros', 20 * 60)) jobs.add('cadastros')   // 02h de Brasília
      }
      for (const j of jobs) await runSlice(env, tenant, j)
    } catch (e) { console.error('sync agendado falhou', tenant, e) }
  }
}
const JOBS_RESUMIVEIS: JobName[] = ['cadastros', 'pedidos', 'backfill']
