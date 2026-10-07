import { Hono } from 'hono'
import { type App, tenantOf, requireRole, fail } from '../lib'
import { mesValido, mesDe, janelaDoMes, mesesAte, rotuloMes, taxa, variacaoPct, calcularNps, janelasComparativo, foiReativado, cumprimentoAgenda } from '../domain/painel'

/** Painel do gestor (plano Distribuidor). Só gestor/admin. Vendas atribuídas à carteira ATUAL de cada cliente; nada de custo ou margem. */
export const painel = new Hono<App>()
painel.use('*', requireRole('manager'))
const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
const utc = (s: string) => new Date(s.replace(' ', 'T') + 'Z')

painel.get('/', async c => {
  const t = tenantOf(c), db = c.env.DB, agora = new Date()
  const q = c.req.query('mes')
  if (q !== undefined && !mesValido(q)) throw fail(400, 'Mês inválido. Use AAAA-MM.')
  const mes = q ?? mesDe(agora), w = janelaDoMes(mes), meses = mesesAte(mes, 12), ini = janelaDoMes(meses[0]).de

  const [serie, doMes, porVend, status, contatos, vencidos, leadsEtapa, leadsMes, leadsOrigem, nps, detratores, equipe, carteira] = await Promise.all([
    db.prepare(`SELECT strftime('%Y-%m', datetime(ordered_at, '-3 hours')) AS m, SUM(total) AS fat, COUNT(*) AS ped, COUNT(DISTINCT pessoa_rein_id) AS clientes
                  FROM rein_pedidos WHERE tenant_id=? AND cancelled=0 AND ordered_at >= ? AND ordered_at < ? GROUP BY m`).bind(t, ini, w.ate).all<any>(),
    db.prepare('SELECT COALESCE(SUM(total),0) AS fat, COUNT(*) AS ped, COUNT(DISTINCT pessoa_rein_id) AS clientes FROM rein_pedidos WHERE tenant_id=? AND cancelled=0 AND ordered_at >= ? AND ordered_at < ?').bind(t, w.de, w.ate).first<any>(),
    db.prepare(`SELECT a.owner_id AS dono, COUNT(*) AS carteira, SUM(CASE WHEN m.ped > 0 THEN 1 ELSE 0 END) AS positivados, COALESCE(SUM(m.fat), 0) AS fat, COALESCE(SUM(m.ped), 0) AS ped
                  FROM accounts a JOIN rein_pessoas p ON p.tenant_id = a.tenant_id AND p.rein_id = a.pessoa_rein_id AND p.deleted_at IS NULL
                  LEFT JOIN (SELECT pessoa_rein_id, COUNT(*) AS ped, SUM(total) AS fat FROM rein_pedidos WHERE tenant_id=?1 AND cancelled=0 AND ordered_at >= ?2 AND ordered_at < ?3 GROUP BY pessoa_rein_id) m ON m.pessoa_rein_id = a.pessoa_rein_id
                 WHERE a.tenant_id = ?1 AND a.status <> 'PROSPECT' GROUP BY a.owner_id`).bind(t, w.de, w.ate).all<any>(),
    db.prepare('SELECT status, COUNT(*) AS n FROM accounts a WHERE tenant_id=? GROUP BY status').bind(t).all<any>(),
    db.prepare("SELECT user_id, COUNT(*) AS n FROM interactions WHERE tenant_id=? AND result IS NOT NULL AND created_at >= ? AND created_at < ? GROUP BY user_id").bind(t, w.de, w.ate).all<any>(),
    db.prepare('SELECT owner_id AS dono, COUNT(*) AS n FROM accounts WHERE tenant_id=? AND owner_id IS NOT NULL AND next_contact_due <= ? GROUP BY owner_id').bind(t, fmt(agora)).all<any>(),
    db.prepare("SELECT stage, COUNT(*) AS n FROM leads WHERE tenant_id=? AND stage IN ('NOVO','CONTATADO','CATALOGO_ENVIADO','NEGOCIANDO') GROUP BY stage").bind(t).all<any>(),
    db.prepare(`SELECT (SELECT COUNT(*) FROM leads WHERE tenant_id=?1 AND created_at >= ?2 AND created_at < ?3) AS criados,
                       (SELECT COUNT(*) FROM leads WHERE tenant_id=?1 AND converted_at >= ?2 AND converted_at < ?3) AS convertidos,
                       (SELECT COUNT(*) FROM leads WHERE tenant_id=?1 AND stage='PERDIDO' AND updated_at >= ?2 AND updated_at < ?3) AS perdidos`).bind(t, w.de, w.ate).first<any>(),
    db.prepare('SELECT source, COUNT(*) AS n FROM leads WHERE tenant_id=? AND created_at >= ? AND created_at < ? GROUP BY source').bind(t, w.de, w.ate).all<any>(),
    db.prepare("SELECT score FROM nps_responses WHERE tenant_id=? AND answered_at >= datetime('now','-90 days') AND score IS NOT NULL").bind(t).all<any>(),
    db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE tenant_id=? AND type='TRATAR_NPS' AND status='ABERTA'").bind(t).first<any>(),
    db.prepare("SELECT u.id, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.tenant_id=? AND m.active=1 AND m.role='seller' ORDER BY u.name").bind(t).all<any>(),
    db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE tenant_id=? AND status <> 'PROSPECT'").bind(t).first<any>(),
  ])
  const fe = new Map<string, number>(contatos.results.map((r: any) => [r.user_id, r.n])), ve = new Map<string, number>(vencidos.results.map((r: any) => [r.dono, r.n]))
  const por = new Map<string | null, any>(porVend.results.map((r: any) => [r.dono, r]))
  const nomes = new Map<string, string>(equipe.results.map((u: any) => [u.id, u.name]))
  const ids = [...new Set<string | null>([...equipe.results.map((u: any) => u.id), ...por.keys()])]
  const nomeDe = async (id: string) => nomes.get(id) ?? (await db.prepare('SELECT name FROM users WHERE id=?').bind(id).first<{ name: string }>())?.name ?? 'Ex-vendedor'
  const vendedores = []
  for (const id of ids) {
    const r = por.get(id) ?? { carteira: 0, positivados: 0, fat: 0, ped: 0 }, feitos = id ? fe.get(id) ?? 0 : 0, venc = id ? ve.get(id) ?? 0 : 0
    vendedores.push({ id, nome: id ? await nomeDe(id) : 'Sem dono', carteira: r.carteira, positivados: r.positivados, positivacao: taxa(r.positivados, r.carteira), faturamento: r.fat, pedidos: r.ped,
      ticket: r.ped ? Math.round(r.fat / r.ped) : 0, contatosFeitos: feitos, vencidos: venc, cumprimento: cumprimentoAgenda(feitos, venc) })
  }
  vendedores.sort((a, b) => b.faturamento - a.faturamento)

  const cart = carteira?.n ?? 0, sm = new Map<string, any>(serie.results.map((r: any) => [r.m, r]))
  const notas = calcularNps(nps.results.map((r: any) => r.score)), n = (s: string) => status.results.find((x: any) => x.status === s)?.n ?? 0
  const fechados = (leadsMes?.convertidos ?? 0) + (leadsMes?.perdidos ?? 0)
  return c.json({
    mes, rotulo: rotuloMes(mes),
    resumo: { faturamento: doMes?.fat ?? 0, pedidos: doMes?.ped ?? 0, ticket: doMes?.ped ? Math.round(doMes.fat / doMes.ped) : 0, positivados: doMes?.clientes ?? 0, carteira: cart, positivacao: taxa(doMes?.clientes ?? 0, cart) },
    serie: meses.map(m => ({ mes: m, rotulo: rotuloMes(m), faturamento: sm.get(m)?.fat ?? 0, pedidos: sm.get(m)?.ped ?? 0, positivados: sm.get(m)?.clientes ?? 0, positivacao: taxa(sm.get(m)?.clientes ?? 0, cart) })),
    carteira: { ativos: n('ATIVO'), emRisco: n('EM_RISCO'), inativos: n('INATIVO'), prospects: n('PROSPECT') },
    vendedores,
    leads: { porEtapa: ['NOVO', 'CONTATADO', 'CATALOGO_ENVIADO', 'NEGOCIANDO'].map(e => ({ etapa: e, n: leadsEtapa.results.find((x: any) => x.stage === e)?.n ?? 0 })),
      criadosNoMes: leadsMes?.criados ?? 0, convertidosNoMes: leadsMes?.convertidos ?? 0, perdidosNoMes: leadsMes?.perdidos ?? 0, taxaConversao: taxa(leadsMes?.convertidos ?? 0, fechados), porOrigem: leadsOrigem.results.map((r: any) => ({ origem: r.source, n: r.n })) },
    nps: { ...notas, detratoresAbertos: detratores?.n ?? 0, periodo: 'últimos 90 dias' },
  })
})

/** Antes × depois: últimos 60 dias contra os 60 anteriores (base para medir o efeito do app na AC3). */
painel.get('/comparativo', async c => {
  const t = tenantOf(c), db = c.env.DB, agora = new Date(), j = janelasComparativo(agora)
  const cart = (await db.prepare("SELECT COUNT(*) AS n FROM accounts WHERE tenant_id=? AND status <> 'PROSPECT'").bind(t).first<{ n: number }>())?.n ?? 0
  const medir = async (w: { de: string; ate: string }) => {
    const [v, reat, leads, contatos] = await Promise.all([
      db.prepare('SELECT COALESCE(SUM(total),0) AS fat, COUNT(*) AS ped, COUNT(DISTINCT pessoa_rein_id) AS clientes FROM rein_pedidos WHERE tenant_id=? AND cancelled=0 AND ordered_at >= ? AND ordered_at < ?').bind(t, w.de, w.ate).first<any>(),
      db.prepare(`SELECT MIN(CASE WHEN ordered_at >= ?2 THEN ordered_at END) AS f, MAX(CASE WHEN ordered_at < ?2 THEN ordered_at END) AS prev FROM rein_pedidos
                   WHERE tenant_id=?1 AND cancelled=0 AND ordered_at < ?3 GROUP BY pessoa_rein_id HAVING f IS NOT NULL`).bind(t, w.de, w.ate).all<any>(),
      db.prepare('SELECT COUNT(*) AS n FROM leads WHERE tenant_id=? AND converted_at >= ? AND converted_at < ?').bind(t, w.de, w.ate).first<any>(),
      db.prepare('SELECT COUNT(*) AS n FROM interactions WHERE tenant_id=? AND result IS NOT NULL AND created_at >= ? AND created_at < ?').bind(t, w.de, w.ate).first<any>(),
    ])
    return { de: w.de, ate: w.ate, faturamento: v?.fat ?? 0, pedidos: v?.ped ?? 0, clientesPositivados: v?.clientes ?? 0, positivacao: taxa(v?.clientes ?? 0, cart),
      reativados: reat.results.filter((r: any) => foiReativado(r.prev ? utc(r.prev) : null, utc(r.f))).length, leadsConvertidos: leads?.n ?? 0, contatosFeitos: contatos?.n ?? 0 }
  }
  const [atual, anterior] = await Promise.all([medir(j.atual), medir(j.anterior)])
  return c.json({ dias: 60, carteira: cart, atual, anterior, variacao: { faturamento: variacaoPct(atual.faturamento, anterior.faturamento), pedidos: variacaoPct(atual.pedidos, anterior.pedidos), clientesPositivados: variacaoPct(atual.clientesPositivados, anterior.clientesPositivados) } })
})
