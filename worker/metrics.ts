/** Recalcula as métricas da carteira (accounts) de UMA empresa a partir do espelho do ERP. Usa só funções puras de worker/domain. */
import { donoDaConta } from './domain/carteira-erp'
import { alinharLeadsComCarteira, carregarConfigPessoa } from './carteira-erp'
import { type Params, mergeParams, statusDe, curvaABC, frequenciaDias, proximoContato, scorePrioridade, DIA, diasEntre } from './domain/carteira'

const utc = (s: string | null) => (s ? new Date(s.replace(' ', 'T') + 'Z') : null)
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)

export async function loadParams(db: D1Database, tenantId: string): Promise<Params> {
  const r = await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='params'").bind(tenantId).first<{ value: string }>()
  try { return mergeParams(r ? JSON.parse(r.value) : null) } catch { return mergeParams(null) }
}

export async function recomputeAccounts(db: D1Database, tenantId: string, agora = new Date()): Promise<{ contas: number; semDono: number }> {
  const p = await loadParams(db, tenantId), cfgPessoa = await carregarConfigPessoa(db, tenantId), erpManda = !!cfgPessoa.campoVendedor
  const desde12 = fmt(new Date(agora.getTime() - 365 * DIA))!, desde24 = fmt(new Date(agora.getTime() - 730 * DIA))!

  const pessoas = await db.prepare(
    `SELECT p.rein_id AS id,
            a.n24, a.primeiro, a.ultimo, a.n12, a.rev12,
            (SELECT o.vendedor_rein_id FROM rein_pedidos o WHERE o.tenant_id = p.tenant_id AND o.pessoa_rein_id = p.rein_id AND o.cancelled = 0 ORDER BY o.ordered_at DESC LIMIT 1) AS vendedor,
            CASE WHEN ?4 <> '' THEN json_extract(p.raw, '$.' || ?4) END AS vendedor_erp
       FROM rein_pessoas p
       LEFT JOIN (SELECT pessoa_rein_id, COUNT(*) AS n24, MIN(ordered_at) AS primeiro, MAX(ordered_at) AS ultimo,
                         SUM(CASE WHEN ordered_at >= ?2 THEN 1 ELSE 0 END) AS n12, SUM(CASE WHEN ordered_at >= ?2 THEN total ELSE 0 END) AS rev12
                    FROM rein_pedidos WHERE tenant_id = ?1 AND cancelled = 0 AND ordered_at >= ?3 GROUP BY pessoa_rein_id) a ON a.pessoa_rein_id = p.rein_id
      WHERE p.tenant_id = ?1 AND p.deleted_at IS NULL`).bind(tenantId, desde12, desde24, cfgPessoa.campoVendedor).all<any>()

  const contatos = await db.prepare('SELECT pessoa_rein_id, last_contact_at, reschedule_at, owner_id FROM accounts WHERE tenant_id=?').bind(tenantId).all<any>()
  const porConta = new Map(contatos.results.map((r: any) => [r.pessoa_rein_id, r]))
  const donos = await db.prepare('SELECT user_id, rein_user_id FROM members WHERE tenant_id=? AND active=1 AND rein_user_id IS NOT NULL').bind(tenantId).all<any>()
  const donoPorVendedor = new Map(donos.results.map((r: any) => [r.rein_user_id, r.user_id]))

  const pendentes = new Set((await db.prepare("SELECT pessoa_rein_id FROM owner_erp_sync WHERE tenant_id=? AND status IN ('PENDENTE','ENVIANDO','ERRO')").bind(tenantId).all<any>()).results.map((x: any) => x.pessoa_rein_id))
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
    // o ERP manda na carteira: campo do vendedor no ERP (se configurado) > vendedor do último pedido (só como semente para conta sem dono)
    const donoCampoErp = erpManda && r.vendedor_erp != null ? donoPorVendedor.get(Number(r.vendedor_erp)) ?? null : null
    const donoUltimoPedido = donoPorVendedor.get(r.vendedor) ?? null
    const regra = donoDaConta({ donoAtual: antigo?.owner_id ?? null, donoErp: donoCampoErp ?? (antigo?.owner_id ? null : donoUltimoPedido), trocaLocalPendente: pendentes.has(r.id), erpManda })
    const dono = regra.dono
    if (!dono && !antigo) semDono++
    const sobrescreve = !!antigo && regra.mudou && regra.porErp   // o ERP mudou o vendedor: o app acompanha
    if (sobrescreve) stmts.push(db.prepare('INSERT INTO ownership_history (id, tenant_id, pessoa_rein_id, from_user_id, to_user_id, by_user_id) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(), tenantId, r.id, antigo.owner_id, dono, 'erp'))
    stmts.push(db.prepare(
      `INSERT INTO accounts (tenant_id, pessoa_rein_id, owner_id, curve, status, revenue_12m, orders_12m, avg_ticket, avg_interval_days, last_order_at, next_contact_due, priority_score, computed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(tenant_id, pessoa_rein_id) DO UPDATE SET
         owner_id = CASE WHEN ? THEN excluded.owner_id ELSE COALESCE(accounts.owner_id, excluded.owner_id) END,   -- sem mudança do ERP, o dono definido nunca muda aqui
         curve=excluded.curve, status=excluded.status, revenue_12m=excluded.revenue_12m, orders_12m=excluded.orders_12m, avg_ticket=excluded.avg_ticket,
         avg_interval_days=excluded.avg_interval_days, last_order_at=excluded.last_order_at, next_contact_due=excluded.next_contact_due,
         priority_score=excluded.priority_score, computed_at=excluded.computed_at`)
      .bind(tenantId, r.id, dono, curva, status, r.rev12 ?? 0, r.n12 ?? 0, r.n12 ? Math.round((r.rev12 ?? 0) / r.n12) : null, intervalo, r.ultimo, fmt(prox), score, fmt(agora), sobrescreve ? 1 : 0))
  }
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  await alinharLeadsComCarteira(db, tenantId)   // leads abertos seguem o vendedor da carteira do cliente
  return { contas: pessoas.results.length, semDono }
}

/** Atualiza só o agendamento e a prioridade de UMA conta (depois de registrar contato), com a curva/status já calculados. */
export async function rescoreAccount(db: D1Database, tenantId: string, pessoaId: number, agora = new Date()) {
  const a = await db.prepare('SELECT curve, status, orders_12m, last_order_at, avg_interval_days, last_contact_at, reschedule_at FROM accounts WHERE tenant_id=? AND pessoa_rein_id=?').bind(tenantId, pessoaId).first<any>()
  if (!a) return
  const p = await loadParams(db, tenantId), ultimo = utc(a.last_order_at)
  const prox = proximoContato(utc(a.last_contact_at), frequenciaDias(a.curve, a.status, p), agora, utc(a.reschedule_at))
  const score = scorePrioridade({ curva: a.curve, status: a.status, pedidos12m: a.orders_12m, ultimoPedido: ultimo, intervaloMedioDias: a.avg_interval_days, proximoContato: prox }, agora, p)
  await db.prepare('UPDATE accounts SET next_contact_due=?, priority_score=? WHERE tenant_id=? AND pessoa_rein_id=?').bind(fmt(prox), score, tenantId, pessoaId).run()
}
