/** Recalcula as métricas da carteira (accounts) de UMA empresa a partir do espelho do ERP. Usa só funções puras de worker/domain. */
import { type Params, mergeParams, statusDe, curvaABC, frequenciaDias, proximoContato, scorePrioridade, DIA, diasEntre } from './domain/carteira'

const utc = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null)
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)

export async function loadParams(db: D1Database, tenantId: string): Promise<Params> {
  const r = await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='params'").bind(tenantId).first<{ value: string }>()
  try { return mergeParams(r ? JSON.parse(r.value) : null) } catch { return mergeParams(null) }
}

export async function recomputeAccounts(db: D1Database, tenantId: string, agora = new Date()): Promise<{ contas: number; semDono: number }> {
  const p = await loadParams(db, tenantId)
  const desde12 = fmt(new Date(agora.getTime() - 365 * DIA))!, desde24 = fmt(new Date(agora.getTime() - 730 * DIA))!

  const pessoas = await db.prepare(
    `SELECT p.rein_id AS id,
            a.n24, a.primeiro, a.ultimo, a.n12, a.rev12,
            (SELECT o.vendedor_rein_id FROM rein_pedidos o WHERE o.tenant_id = p.tenant_id AND o.pessoa_rein_id = p.rein_id AND o.cancelled = 0 ORDER BY o.ordered_at DESC LIMIT 1) AS vendedor
       FROM rein_pessoas p
       LEFT JOIN (SELECT pessoa_rein_id, COUNT(*) AS n24, MIN(ordered_at) AS primeiro, MAX(ordered_at) AS ultimo,
                         SUM(CASE WHEN ordered_at >= ?2 THEN 1 ELSE 0 END) AS n12, SUM(CASE WHEN ordered_at >= ?2 THEN total ELSE 0 END) AS rev12
                    FROM rein_pedidos WHERE tenant_id = ?1 AND cancelled = 0 AND ordered_at >= ?3 GROUP BY pessoa_rein_id) a ON a.pessoa_rein_id = p.rein_id
      WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL`).bind(tenantId, desde12, desde24).all<any>()

  const contatos = await db.prepare('SELECT pessoa_rein_id, last_contact_at, reschedule_at FROM accounts WHERE tenant_id=?').bind(tenantId).all<any>()
  const porConta = new Map(contatos.results.map((r: any) => [r.pessoa_rein_id, r]))
  const donos = await db.prepare('SELECT user_id, rein_user_id FROM members WHERE tenant_id=? AND active=1 AND rein_user_id IS NOT NULL').bind(tenantId).all<any>()
  const donoPorVendedor = new Map(donos.results.map((r: any) => [r.rein_user_id, r.user_id]))

  const curvas = curvaABC(pessoas.results.map((r: any) => ({ id: r.id, faturamento: r.rev12 ?? 0 })), p)
  const stmts: D1PreparedStatement[] = []
  let semDono = 0
  for (const r of pessoas.results as any[]) {
    const ultimo = utc(r.ultimo), curva = curvas.get(r.id) ?? null
    const status = statusDe(ultimo, agora, p)
    const antigo = porConta.get(r.id)
    const ultimoContato = utc(antigo?.last_contact_at ?? null)
    const intervalo = r.n24 >= 2 ? Math.round(diasEntre(utc(r.primeiro)!, ultimo!) / (r.n24 - 1)) : null
    const prox = proximoContato(ultimoContato, frequenciaDias(curva, status, p), agora, utc(antigo?.reschedule_at ?? null))
    const score = scorePrioridade({ curva, status, pedidos12m: r.n12 ?? 0, ultimoPedido: ultimo, intervaloMedioDias: intervalo, proximoContato: prox }, agora, p)
    const dono = donoPorVendedor.get(r.vendedor) ?? null
    if (!dono && !antigo) semDono++
    stmts.push(db.prepare(
      `INSERT INTO accounts (tenant_id, pessoa_rein_id, owner_id, curve, status, revenue_12m, orders_12m, avg_ticket, avg_interval_days, last_order_at, next_contact_due, priority_score, computed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(tenant_id, pessoa_rein_id) DO UPDATE SET
         owner_id = COALESCE(accounts.owner_id, excluded.owner_id),    -- a carteira só muda pelo gestor depois do primeiro dono
         curve=excluded.curve, status=excluded.status, revenue_12m=excluded.revenue_12m, orders_12m=excluded.orders_12m, avg_ticket=excluded.avg_ticket,
         avg_interval_days=excluded.avg_interval_days, last_order_at=excluded.last_order_at, next_contact_due=excluded.next_contact_due,
         priority_score=excluded.priority_score, computed_at=excluded.computed_at`)
      .bind(tenantId, r.id, dono, curva, status, r.rev12 ?? 0, r.n12 ?? 0, r.n12 ? Math.round((r.rev12 ?? 0) / r.n12) : null, intervalo, r.ultimo, fmt(prox), score, fmt(agora)))
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  return { contas: stmts.length, semDono }
}
