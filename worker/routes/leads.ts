import { Hono } from 'hono'
import { type App, type C, tenantOf, requireRole, fail, newId, clean, audit, digits } from '../lib'
import { ehEtapa, validarTransicao, proximoFollowup, mesclarConfigPessoa, montarCorpoPessoa, estaAberto, ABERTAS, type Etapa } from '../domain/leads'
import { criarLead, escolherDonoRodizio } from '../leads'
import { loadReinCreds } from './rein'
import { reinApiFor } from '../rein/api'

export const leads = new Hono<App>()
const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : null)

const COLS = `l.id, l.cnpj, l.razao_social AS razaoSocial, l.contact_name AS contato, l.whatsapp, l.city AS cidade, l.uf, l.segment AS segmento, l.source AS origem, l.stage AS etapa,
  l.lost_reason AS motivoPerda, l.owner_id AS donoId, u.name AS dono, l.pessoa_rein_id AS pessoaId, l.existing_client AS jaCliente, l.erp_status AS erpStatus, l.erp_error AS erpErro,
  l.next_followup_at AS proximoContato, l.created_at AS criadoEm, l.updated_at AS atualizadoEm`
const FROM = 'FROM leads l LEFT JOIN users u ON u.id = l.owner_id'

/** Vendedor só mexe nos leads dele; gestor/admin em todos da empresa. */
async function carregar(c: C, id: string) {
  const s = c.get('session'), meu = s.role === 'seller'
  const r = await c.env.DB.prepare(`SELECT l.* ${FROM} WHERE l.id = ? AND l.tenant_id = ?${meu ? ' AND l.owner_id = ?' : ''}`).bind(...[id, tenantOf(c), ...(meu ? [s.userId] : [])]).first<any>()
  if (!r) throw fail(404, 'Lead não encontrado.')
  return r
}
const evento = (db: D1Database, t: string, leadId: string, userId: string | null, type: string, text: string) =>
  db.prepare('INSERT INTO lead_events (id, tenant_id, lead_id, user_id, type, text) VALUES (?,?,?,?,?,?)').bind(newId(), t, leadId, userId, type, text)
const donoAtivo = async (db: D1Database, t: string, id: string) => !!(await db.prepare('SELECT 1 FROM members WHERE tenant_id=? AND user_id=? AND active=1').bind(t, id).first())

leads.get('/', async c => {
  const t = tenantOf(c), s = c.get('session'), q = c.req.query()
  const where = ['l.tenant_id = ?', "(l.stage IN ('NOVO','CONTATADO','CATALOGO_ENVIADO','NEGOCIANDO') OR l.updated_at >= datetime('now','-60 days'))"], args: unknown[] = [t]
  if (s.role === 'seller') { where.push('l.owner_id = ?'); args.push(s.userId) }
  else if (q.dono === 'sem') where.push('l.owner_id IS NULL')
  else if (q.dono) { where.push('l.owner_id = ?'); args.push(q.dono) }
  const busca = clean(q.q, 60).toLowerCase()
  if (busca) { const like = `%${busca.replace(/[%_]/g, '')}%`, d = digits(busca); where.push(`(lower(l.razao_social) LIKE ? OR lower(l.contact_name) LIKE ?${d.length >= 3 ? ' OR l.cnpj LIKE ? OR l.whatsapp LIKE ?' : ''})`); args.push(like, like); if (d.length >= 3) args.push(`%${d}%`, `%${d}%`) }
  const r = await c.env.DB.prepare(`SELECT ${COLS} ${FROM} WHERE ${where.join(' AND ')} ORDER BY l.created_at DESC LIMIT 500`).bind(...args).all()
  const empresa = await c.env.DB.prepare('SELECT slug FROM tenants WHERE id=?').bind(t).first<{ slug: string }>()
  return c.json({ itens: r.results, linkFormulario: `${new URL(c.req.url).origin}/seja-revendedor/${empresa?.slug}` })
})

/** Cadastro manual. Vendedor cadastra para si; gestor escolhe o dono ou deixa o rodízio decidir. */
leads.post('/', async c => {
  const t = tenantOf(c), s = c.get('session'), b = await c.req.json<any>()
  let donoPreferido: string | null = null
  if (s.role === 'seller') donoPreferido = s.userId
  else if (b.dono) { if (!(await donoAtivo(c.env.DB, t, String(b.dono)))) throw fail(400, 'Essa pessoa não faz parte da equipe.'); donoPreferido = String(b.dono) }
  const r = await criarLead(c.env, t, b, { criadoPor: s.userId, donoPreferido, publico: false })
  return c.json({ id: r.id, dono: r.dono })
})

leads.get('/:id', async c => {
  const t = tenantOf(c), l = await carregar(c, c.req.param('id'))
  const [ev, dono] = await Promise.all([
    c.env.DB.prepare('SELECT e.type, e.text, e.created_at AS criadoEm, u.name AS quem FROM lead_events e LEFT JOIN users u ON u.id = e.user_id WHERE e.tenant_id=? AND e.lead_id=? ORDER BY e.created_at DESC, e.rowid DESC LIMIT 50').bind(t, l.id).all(),
    l.owner_id ? c.env.DB.prepare('SELECT name FROM users WHERE id=?').bind(l.owner_id).first<{ name: string }>() : null,
  ])
  let enr: any = null; try { enr = l.enrichment ? JSON.parse(l.enrichment) : null } catch { /* ignora */ }
  return c.json({ id: l.id, cnpj: l.cnpj, razaoSocial: l.razao_social, contato: l.contact_name, whatsapp: l.whatsapp, cidade: l.city, uf: l.uf, segmento: l.segment, origem: l.source, etapa: l.stage, motivoPerda: l.lost_reason,
    donoId: l.owner_id, dono: dono?.name ?? null, pessoaId: l.pessoa_rein_id, jaCliente: !!l.existing_client, erpStatus: l.erp_status, erpErro: l.erp_error, proximoContato: l.next_followup_at, criadoEm: l.created_at,
    receita: enr && { situacao: enr.situacao, cnae: enr.cnae, fantasia: enr.fantasia }, eventos: ev.results })
})

/** Mover de etapa, anotar, trocar o dono (gestor) ou adiar o retorno. */
leads.patch('/:id', async c => {
  const t = tenantOf(c), db = c.env.DB, s = c.get('session'), l = await carregar(c, c.req.param('id')), b = await c.req.json<any>(), agora = new Date()
  const stmts: D1PreparedStatement[] = []
  const sets: string[] = [], args: unknown[] = []

  if (b.etapa !== undefined && b.etapa !== l.stage) {
    if (!ehEtapa(b.etapa)) throw fail(400, 'Etapa inválida.')
    const v = validarTransicao(l.stage as Etapa, b.etapa, b.motivoPerda); if (!v.ok) throw fail(400, v.erro)
    sets.push('stage=?', 'lost_reason=?', 'next_followup_at=?'); args.push(b.etapa, b.etapa === 'PERDIDO' ? clean(b.motivoPerda, 200) : null, fmt(proximoFollowup(b.etapa, agora)))
    stmts.push(evento(db, t, l.id, s.userId, 'etapa', `${l.stage} → ${b.etapa}${b.etapa === 'PERDIDO' ? ` (${clean(b.motivoPerda, 200)})` : ''}`))
  }
  if (b.dono !== undefined && (b.dono || null) !== l.owner_id) {
    if (s.role === 'seller') throw fail(403, 'Só o gestor troca o vendedor do lead.')
    if (b.dono && !(await donoAtivo(db, t, String(b.dono)))) throw fail(400, 'Essa pessoa não faz parte da equipe.')
    sets.push('owner_id=?'); args.push(b.dono || null); stmts.push(evento(db, t, l.id, s.userId, 'dono', b.dono ? 'Passou para outro vendedor.' : 'Ficou sem dono.'))
  }
  if (b.adiarDias !== undefined) {
    const n = Number(b.adiarDias)
    if (!estaAberto(l.stage) || !Number.isInteger(n) || n < 1 || n > 60) throw fail(400, 'Escolha de 1 a 60 dias.')
    sets.push('next_followup_at=?'); args.push(fmt(new Date(agora.getTime() + n * 864e5))); stmts.push(evento(db, t, l.id, s.userId, 'nota', `Retorno adiado em ${n} dia(s).`))
  }
  if (clean(b.nota, 500)) stmts.push(evento(db, t, l.id, s.userId, 'nota', clean(b.nota, 500)))
  if (!stmts.length && !sets.length) throw fail(400, 'Nada para alterar.')
  try {
    await db.batch([...(sets.length ? [db.prepare(`UPDATE leads SET ${sets.join(', ')}, updated_at=datetime('now') WHERE id=? AND tenant_id=?`).bind(...args, l.id, t)] : []), ...stmts])
  } catch (e: any) {
    if (/UNIQUE|constraint/i.test(String(e?.message))) throw fail(409, 'Já existe outro lead aberto com este CNPJ. Trabalhe nele em vez de reabrir este.')
    throw e
  }
  return c.json({ ok: true })
})

/* ---------- cadastro no ERP (PUT /pessoa), atrás de pessoa_write_enabled ---------- */
const escritaPessoaLigada = async (db: D1Database, t: string) => !!(await db.prepare('SELECT pessoa_write_enabled AS e FROM tenant_rein WHERE tenant_id=?').bind(t).first<{ e: number }>())?.e

leads.post('/:id/push-erp', async c => {
  const t = tenantOf(c), db = c.env.DB, s = c.get('session'), l = await carregar(c, c.req.param('id'))
  if (l.pessoa_rein_id || l.erp_status === 'ENVIADO') throw fail(409, 'Este CNPJ já está cadastrado no ERP.')
  if (l.erp_status === 'ENVIANDO') throw fail(409, 'O cadastro está sendo enviado. Se travou, peça ao gestor para conferir no ERP.')
  if (!(await escritaPessoaLigada(db, t))) {
    await db.prepare("UPDATE leads SET erp_status='PENDENTE_FLAG', erp_error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(l.id, t).run()
    return c.json({ status: 'PENDENTE_FLAG', aviso: 'O cadastro direto no ERP está desligado para esta empresa. Cadastre este CNPJ no ERP manualmente.' })
  }
  const creds = await loadReinCreds(c.env, t)
  if (!creds) throw fail(400, 'Configure a conexão com o ERP primeiro.')
  if (!creds.mock && (!creds.clientId || !creds.clientSecret || !creds.database)) throw fail(400, 'Preencha as credenciais do ERP ou ligue o modo de teste.')
  let fantasia: string | null = null; try { fantasia = l.enrichment ? JSON.parse(l.enrichment).fantasia ?? null : null } catch { /* ignora */ }
  const cfg = mesclarConfigPessoa(await db.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='pessoa_erp'").bind(t).first<{ value: string }>().then(r => { try { return r ? JSON.parse(r.value) : null } catch { return null } }))
  const corpo = montarCorpoPessoa({ cnpj: l.cnpj, razaoSocial: l.razao_social, fantasia, contato: l.contact_name, whatsapp: l.whatsapp }, cfg)
  if (!corpo.ok) throw fail(400, corpo.erro)

  const claim = await db.prepare("UPDATE leads SET erp_status='ENVIANDO', updated_at=datetime('now') WHERE id=? AND tenant_id=? AND erp_status IN ('NAO_ENVIADO','PENDENTE_FLAG','ERRO')").bind(l.id, t).run()
  if (!claim.meta.changes) throw fail(409, 'Este cadastro já está sendo enviado ou foi enviado.')
  try {
    const r = await reinApiFor(creds).createPessoa(corpo.corpo)
    await db.batch([db.prepare("UPDATE leads SET erp_status='ENVIADO', erp_error=NULL, pessoa_rein_id=COALESCE(?, pessoa_rein_id), updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(r.id, l.id, t),
      evento(db, t, l.id, s.userId, 'erp', `Cadastrado no ERP${r.id ? ` (nº ${r.id})` : ''}${creds.mock ? ' [modo de teste]' : ''}.`)])
    await audit(db, t, s.userId, 'lead.erp', { id: l.id, pessoaReinId: r.id, teste: creds.mock })
    return c.json({ status: 'ENVIADO', pessoaReinId: r.id, modoTeste: creds.mock })
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300)
    await db.prepare("UPDATE leads SET erp_status='ERRO', erp_error=?, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(msg, l.id, t).run()
    await audit(db, t, s.userId, 'lead.erp_erro', { id: l.id, erro: msg })
    throw fail(502, `O ERP não confirmou o cadastro: ${msg}. Se foi falha de conexão, confira no ERP se o CNPJ já entrou ANTES de tentar de novo.`)
  }
})

/** Gestor resolve cadastro travado depois de conferir no ERP. */
leads.post('/:id/erp-resolver', requireRole('manager'), async c => {
  const t = tenantOf(c), l = await carregar(c, c.req.param('id')), b = await c.req.json<any>()
  if (!['ENVIANDO', 'ERRO'].includes(l.erp_status)) throw fail(409, 'Só dá para resolver cadastro com erro ou travado.')
  if (b.resultado !== 'ENVIADO' && b.resultado !== 'NAO_ENVIADO') throw fail(400, 'Escolha “ENVIADO” ou “NAO_ENVIADO”.')
  await c.env.DB.prepare("UPDATE leads SET erp_status=?, erp_error=NULL, updated_at=datetime('now') WHERE id=? AND tenant_id=?").bind(b.resultado, l.id, t).run()
  await audit(c.env.DB, t, c.get('session').userId, 'lead.erp_resolvido', { id: l.id, resultado: b.resultado })
  return c.json({ ok: true })
})
export { ABERTAS, escolherDonoRodizio }
